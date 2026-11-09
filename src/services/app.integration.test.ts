import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import 'fake-indexeddb/auto';
import { createDatabase, type InvitationTrackerDB } from '../db/database.ts';
import { toCsv } from '../lib/share.ts';
import { ContactService, filterPhoneRows } from './ContactService.ts';
import { EventService } from './EventService.ts';
import { ExportService } from './ExportService.ts';
import { ImportService } from './ImportService.ts';
import { InvitationService } from './InvitationService.ts';

const followers = JSON.stringify([
  {
    string_list_data: [{ href: 'https://www.instagram.com/user1', value: 'user1', timestamp: 1000 }],
  },
  {
    string_list_data: [{ href: 'https://www.instagram.com/user2', value: 'user2', timestamp: 1001 }],
  },
  {
    string_list_data: [{ href: 'https://www.instagram.com/_u/user3', value: 'user3', timestamp: 1002 }],
  },
]);

const following = JSON.stringify({
  relationships_following: [
    { title: 'user2', string_list_data: [{ href: 'https://www.instagram.com/_u/user2', timestamp: 2000 }] },
    { title: 'user3', string_list_data: [{ href: 'https://www.instagram.com/user3', timestamp: 2001 }] },
    { title: 'user4', string_list_data: [{ href: 'https://www.instagram.com/user4', timestamp: 2002 }] },
  ],
});

const vcf = `BEGIN:VCARD
VERSION:3.0
UID:phone-ada
FN:Ada Lovelace
TEL;TYPE=CELL:+1 415-555-0133
END:VCARD
`;

async function setup() {
  const db = createDatabase(`invitation-tracker-test-${crypto.randomUUID()}`);
  await db.open();
  return {
    db,
    events: new EventService(db),
    contacts: new ContactService(db),
    invites: new InvitationService(db),
    imports: new ImportService(db),
    exports: new ExportService(db),
  };
}

describe('application integration', () => {
  const dbs: InvitationTrackerDB[] = [];

  afterEach(async () => {
    await Promise.all(
      dbs.splice(0).map(async (db) => {
        db.close();
        await db.delete();
      }),
    );
  });

  it('creates an event, imports VCF, and lists phone contacts', async () => {
    const app = await setup();
    dbs.push(app.db);
    const event = await app.events.create({ name: 'Harvest Dinner', invitationMessage: 'Join us.' });
    const prepared = await app.imports.prepareVcf(vcf);
    const result = await app.imports.commitVcf(prepared);
    assert.equal(result.newContacts, 1);
    const rows = await app.contacts.phoneRows(event.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].contact.name, 'Ada Lovelace');
    assert.equal(rows[0].status, 'pending');
  });

  it('imports followers and following, merging by normalized href', async () => {
    const app = await setup();
    dbs.push(app.db);
    await app.imports.importInstagram(followers, 'followers');
    const second = await app.imports.importInstagram(following, 'following');
    const rows = await app.contacts.instagramRows();
    assert.equal(rows.length, 4);
    const both = rows.filter((row) => row.instagram.isFollower && row.instagram.isFollowing);
    assert.deepEqual(both.map((row) => row.instagram.username).sort(), ['user2', 'user3']);
    assert.equal(second.relationshipChanges, 2);
  });

  it('does not duplicate Instagram contacts on re-import', async () => {
    const app = await setup();
    dbs.push(app.db);
    await app.imports.importInstagram(followers, 'followers');
    const again = await app.imports.importInstagram(followers, 'followers');
    assert.equal(again.newContacts, 0);
    assert.equal(again.updatedContacts, 3);
    assert.equal(await app.db.instagramSources.count(), 3);
  });

  it('marks invited, undoes, and preserves state across re-import', async () => {
    const app = await setup();
    dbs.push(app.db);
    const event = await app.events.create({ name: 'Party' });
    await app.imports.importInstagram(followers, 'followers');
    const rows = await app.contacts.instagramRows(event.id);
    const target = rows.find((row) => row.instagram.username === 'user2');
    assert.ok(target);

    await app.invites.beginDelivery(event.id, target.contact.id);
    const stillPending = await app.db.eventContacts.where('contactId').equals(target.contact.id).first();
    assert.equal(stillPending?.status, 'pending');
    assert.equal(stillPending?.invitedAt, undefined);

    const invited = await app.invites.markInvited({
      eventId: event.id,
      contactId: target.contact.id,
      invitedVia: 'instagram',
    });
    assert.equal(invited.status, 'invited');
    assert.ok(invited.invitedAt);
    assert.equal(invited.invitedVia, 'instagram');
    assert.equal((await app.contacts.instagramRows(event.id)).filter((r) => r.status === 'invited').length, 1);

    await app.imports.importInstagram(followers, 'followers');
    const afterImport = await app.contacts.instagramRows(event.id);
    const stillInvited = afterImport.find((row) => row.instagram.username === 'user2');
    assert.equal(stillInvited?.status, 'invited');
    assert.equal(stillInvited?.invitation?.invitedAt, invited.invitedAt);

    const undone = await app.invites.undo(event.id, target.contact.id);
    assert.equal(undone.status, 'pending');
    assert.equal(undone.invitedAt, undefined);
    assert.equal(undone.invitedVia, undefined);
    assert.equal((await app.contacts.instagramRows(event.id)).filter((r) => r.status === 'pending').length, 3);
  });

  it('preserves VCF invitation state on re-import and keeps Instagram contacts separate', async () => {
    const app = await setup();
    dbs.push(app.db);
    const event = await app.events.create({ name: 'Party' });
    await app.imports.commitVcf(await app.imports.prepareVcf(vcf));
    await app.imports.importInstagram(
      JSON.stringify([
        { string_list_data: [{ href: 'https://www.instagram.com/ada_lovelace', value: 'ada_lovelace' }] },
      ]),
      'followers',
    );
    const phone = (await app.contacts.phoneRows(event.id))[0];
    await app.invites.markInvited({
      eventId: event.id,
      contactId: phone.contact.id,
      invitedVia: 'phone',
      invitedPhone: phone.contact.phones[0].value,
    });
    await app.imports.commitVcf(await app.imports.prepareVcf(vcf));
    const phoneAfter = (await app.contacts.phoneRows(event.id))[0];
    assert.equal(phoneAfter.status, 'invited');
    assert.equal(await app.db.contacts.count(), 2);
    const ig = await app.contacts.instagramRows(event.id);
    assert.notEqual(ig[0].contact.id, phoneAfter.contact.id);
  });

  it('marks a phone contact as not answered', async () => {
    const app = await setup();
    dbs.push(app.db);
    const event = await app.events.create({ name: 'Party' });
    await app.imports.commitVcf(await app.imports.prepareVcf(vcf));
    const phone = (await app.contacts.phoneRows(event.id))[0];
    const marked = await app.invites.markNotAnswered(event.id, phone.contact.id);
    assert.equal(marked.status, 'not_answered');
    assert.equal(marked.invitedAt, undefined);
    const rows = await app.contacts.phoneRows(event.id);
    assert.equal(filterPhoneRows(rows, '', 'not_answered').length, 1);
    assert.equal(filterPhoneRows(rows, '', 'invited').length, 0);
    await app.invites.markInvited({
      eventId: event.id,
      contactId: phone.contact.id,
      invitedVia: 'phone',
      invitedPhone: phone.contact.phones[0].value,
    });
    assert.equal((await app.contacts.phoneRows(event.id))[0].status, 'invited');
  });

  it('exposes the stored Instagram href as the profile link', async () => {
    const app = await setup();
    dbs.push(app.db);
    await app.imports.importInstagram(
      JSON.stringify([
        { string_list_data: [{ href: 'https://www.instagram.com/_u/aswinroopesh', value: 'aswinroopesh' }] },
      ]),
      'followers',
    );
    const row = (await app.contacts.instagramRows())[0];
    assert.equal(row.instagram.href, 'https://www.instagram.com/_u/aswinroopesh');
    assert.equal(row.instagram.profileUrl, 'https://www.instagram.com/_u/aswinroopesh');
    assert.equal(row.instagram.normalizedHref, 'https://www.instagram.com/aswinroopesh');
  });

  it('does not require a profile image URL to keep the contact', async () => {
    const app = await setup();
    dbs.push(app.db);
    await app.imports.importInstagram(followers, 'followers');
    const row = (await app.contacts.instagramRows())[0];
    assert.equal(row.instagram.profileImageUrl, undefined);
    assert.ok(row.contact.id);
  });

  it('exports JSON and CSV with source and invitation state', async () => {
    const app = await setup();
    dbs.push(app.db);
    const event = await app.events.create({ name: 'Harvest', eventDate: '2026-10-12' });
    await app.imports.importInstagram(followers, 'followers');
    const row = (await app.contacts.instagramRows(event.id))[0];
    await app.invites.markInvited({
      eventId: event.id,
      contactId: row.contact.id,
      invitedVia: 'instagram',
    });
    const json = await app.exports.exportJson();
    assert.equal(json.schemaVersion, 2);
    assert.equal(json.instagramSources.length, 3);
    assert.equal(json.eventContacts[0].status, 'invited');
    const csv = await app.exports.exportCsv();
    assert.match(csv, /event_name,event_date,contact_source/);
    assert.match(csv, /instagram/);
    assert.match(csv, /invited/);
    assert.match(csv, new RegExp(row.instagram.username));
  });

  it('stores and clears an invitation image on an event', async () => {
    const app = await setup();
    dbs.push(app.db);
    const event = await app.events.create({
      name: 'Harvest',
      invitationImage: 'data:image/jpeg;base64,abc',
    });
    assert.equal(event.invitationImage, 'data:image/jpeg;base64,abc');
    const renamed = await app.events.update(event.id, { name: 'Harvest Dinner' });
    assert.equal(renamed.invitationImage, 'data:image/jpeg;base64,abc');
    const cleared = await app.events.update(event.id, { name: 'Harvest Dinner', invitationImage: null });
    assert.equal(cleared.invitationImage, undefined);
  });

  it('rejects incompatible restore payloads without writing', async () => {
    const app = await setup();
    dbs.push(app.db);
    await app.events.create({ name: 'Keep me' });
    assert.throws(() => app.exports.validateBackup({ schemaVersion: 1, events: [] }), /schemaVersion/);
    assert.equal(await app.db.events.count(), 1);
  });

  it('serializes CSV cells', () => {
    assert.equal(toCsv(['a', 'b'], [['x,y', 'ok']]), 'a,b\n"x,y",ok\n');
  });
});
