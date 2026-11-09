import type {
  Contact,
  ContactSource,
  DuplicateResolutionAction,
  ImportError,
  ImportResult,
  InstagramSource,
  ParsedVcfContact,
  VcfImportPlan,
} from '../domain/types.ts';
import { createId, nowIso } from '../lib/ids.ts';
import { buildIdentityIndexes, planVcfImport } from '../lib/identity.ts';
import { parseInstagramJsonText } from '../lib/instagram.ts';
import { collapseVcfDuplicates, parseVcf } from '../lib/vcf.ts';
import { normalizeName } from '../lib/normalize.ts';
import type { InvitationTrackerDB } from '../db/database.ts';
import { ContactRepository, SourceRepository } from '../db/repositories.ts';

export type DuplicateResolutions = Record<
  string,
  { action: DuplicateResolutionAction; contactId?: string }
>;

export class ImportService {
  private readonly db: InvitationTrackerDB;
  private readonly contacts: ContactRepository;
  private readonly sources: SourceRepository;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
    this.contacts = new ContactRepository(db);
    this.sources = new SourceRepository(db);
  }

  async prepareVcf(text: string): Promise<VcfImportPlan> {
    const parsed = parseVcf(text);
    const collapsed = collapseVcfDuplicates(parsed.contacts);
    const [allContacts, vcfSources] = await Promise.all([
      this.contacts.all(),
      this.sources.byType('vcf'),
    ]);
    const phoneContacts = allContacts.filter((contact) =>
      vcfSources.some((source) => source.contactId === contact.id),
    );
    const indexes = buildIdentityIndexes(phoneContacts, vcfSources);
    return planVcfImport(
      collapsed.contacts,
      indexes,
      parsed.contacts.length,
      parsed.skipped,
      parsed.errors,
      collapsed.mergedDuplicates,
    );
  }

  async commitVcf(plan: VcfImportPlan, resolutions: DuplicateResolutions = {}): Promise<ImportResult> {
    const timestamp = nowIso();
    let newContacts = 0;
    let updatedContacts = 0;
    const errors: ImportError[] = [...plan.errors];

    const resolvedUpdates = [...plan.toUpdate];
    const resolvedCreates = [...plan.toCreate];

    for (const review of plan.reviews) {
      const resolution = resolutions[review.key];
      if (!resolution || resolution.action === 'create') {
        resolvedCreates.push(review.incoming);
        continue;
      }
      const contactId = resolution.contactId ?? review.candidates[0]?.contactId;
      if (!contactId) {
        resolvedCreates.push(review.incoming);
        continue;
      }
      resolvedUpdates.push({ contactId, incoming: review.incoming });
    }

    await this.db.transaction('rw', [this.db.contacts, this.db.contactSources], async () => {
      for (const incoming of resolvedCreates) {
        await this.insertVcfContact(incoming, timestamp);
        newContacts += 1;
      }
      for (const item of resolvedUpdates) {
        const changed = await this.updateVcfContact(item.contactId, item.incoming, timestamp);
        if (changed) updatedContacts += 1;
      }
    });

    return {
      source: 'vcf',
      totalRecords: plan.totalRecords,
      imported: resolvedCreates.length + resolvedUpdates.length,
      newContacts,
      updatedContacts,
      mergedDuplicates: plan.mergedDuplicates,
      possibleDuplicates: plan.reviews.length,
      skippedRecords: plan.skippedRecords,
      errors,
    };
  }

  async importVcf(text: string, resolutions?: DuplicateResolutions): Promise<{
    plan: VcfImportPlan;
    result?: ImportResult;
  }> {
    const plan = await this.prepareVcf(text);
    const unresolved = plan.reviews.filter((review) => !resolutions?.[review.key]);
    if (unresolved.length > 0 && !resolutions) {
      return { plan };
    }
    const result = await this.commitVcf(plan, resolutions ?? {});
    return { plan, result };
  }

  async importInstagram(
    text: string,
    kind: 'followers' | 'following',
  ): Promise<ImportResult> {
    const parsed = parseInstagramJsonText(text, kind);
    const timestamp = nowIso();
    let newContacts = 0;
    let updatedContacts = 0;
    let relationshipChanges = 0;

    await this.db.transaction(
      'rw',
      [this.db.contacts, this.db.contactSources, this.db.instagramSources],
      async () => {
        for (const record of parsed.records) {
          const existingIg = await this.db.instagramSources.where('normalizedHref').equals(record.normalizedHref).first();
          if (!existingIg) {
            const contactId = createId();
            const sourceId = createId();
            const contact: Contact = {
              id: contactId,
              name: record.username,
              normalizedName: normalizeName(record.username),
              phones: [],
              emails: [],
              createdAt: timestamp,
              updatedAt: timestamp,
              lastSeenImportAt: timestamp,
            };
            const source: ContactSource = {
              id: sourceId,
              contactId,
              sourceType: 'instagram',
              sourceIdentifier: record.normalizedHref,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            const ig: InstagramSource = {
              contactSourceId: sourceId,
              href: record.href,
              normalizedHref: record.normalizedHref,
              username: record.username,
              profileUrl: record.profileUrl,
              isFollower: kind === 'followers',
              isFollowing: kind === 'following',
              followerSince: kind === 'followers' ? record.timestamp : undefined,
              followingSince: kind === 'following' ? record.timestamp : undefined,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
            await this.db.contacts.put(contact);
            await this.db.contactSources.put(source);
            await this.db.instagramSources.put(ig);
            newContacts += 1;
            continue;
          }

          const source = await this.db.contactSources.get(existingIg.contactSourceId);
          const contact = source ? await this.db.contacts.get(source.contactId) : undefined;
          const nextFlags = {
            isFollower: existingIg.isFollower || kind === 'followers',
            isFollowing: existingIg.isFollowing || kind === 'following',
          };
          const changedRelation =
            nextFlags.isFollower !== existingIg.isFollower || nextFlags.isFollowing !== existingIg.isFollowing;
          if (changedRelation) relationshipChanges += 1;

          const nextIg: InstagramSource = {
            ...existingIg,
            href: record.href || existingIg.href,
            username: record.username || existingIg.username,
            profileUrl: record.profileUrl || existingIg.profileUrl,
            isFollower: nextFlags.isFollower,
            isFollowing: nextFlags.isFollowing,
            followerSince:
              kind === 'followers' ? record.timestamp ?? existingIg.followerSince : existingIg.followerSince,
            followingSince:
              kind === 'following' ? record.timestamp ?? existingIg.followingSince : existingIg.followingSince,
            updatedAt: timestamp,
          };
          await this.db.instagramSources.put(nextIg);
          if (source) {
            await this.db.contactSources.put({ ...source, updatedAt: timestamp });
          }
          if (contact) {
            await this.db.contacts.put({
              ...contact,
              name: record.username || contact.name,
              normalizedName: normalizeName(record.username || contact.name),
              lastSeenImportAt: timestamp,
              updatedAt: timestamp,
            });
          }
          updatedContacts += 1;
        }
      },
    );

    return {
      source: kind === 'followers' ? 'instagram-followers' : 'instagram-following',
      totalRecords: parsed.records.length + parsed.skippedRecords,
      imported: parsed.records.length,
      newContacts,
      updatedContacts,
      mergedDuplicates: 0,
      possibleDuplicates: 0,
      skippedRecords: parsed.skippedRecords,
      relationshipChanges,
      errors: parsed.errors,
    };
  }

  private async insertVcfContact(incoming: ParsedVcfContact, timestamp: string): Promise<void> {
    const contact: Contact = {
      id: createId(),
      name: incoming.name,
      normalizedName: incoming.normalizedName,
      phones: incoming.phones,
      emails: incoming.emails,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeenImportAt: timestamp,
    };
    const source: ContactSource = {
      id: createId(),
      contactId: contact.id,
      sourceType: 'vcf',
      sourceIdentifier: incoming.sourceIdentifier,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.db.contacts.put(contact);
    await this.db.contactSources.put(source);
  }

  private async updateVcfContact(
    contactId: string,
    incoming: ParsedVcfContact,
    timestamp: string,
  ): Promise<boolean> {
    const contact = await this.db.contacts.get(contactId);
    if (!contact) {
      await this.insertVcfContact(incoming, timestamp);
      return true;
    }
    const phones = mergePhones(contact.phones, incoming.phones);
    const emails = mergeEmails(contact.emails ?? [], incoming.emails);
    await this.db.contacts.put({
      ...contact,
      name: incoming.name || contact.name,
      normalizedName: incoming.normalizedName || contact.normalizedName,
      phones,
      emails,
      updatedAt: timestamp,
      lastSeenImportAt: timestamp,
    });
    const existingSource = await this.db.contactSources
      .where('[sourceType+sourceIdentifier]')
      .equals(['vcf', incoming.sourceIdentifier])
      .first();
    if (existingSource) {
      await this.db.contactSources.put({ ...existingSource, updatedAt: timestamp });
    } else {
      const byContact = (await this.db.contactSources.where('contactId').equals(contactId).toArray()).find(
        (row) => row.sourceType === 'vcf',
      );
      if (byContact) {
        await this.db.contactSources.put({
          ...byContact,
          sourceIdentifier: incoming.sourceIdentifier,
          updatedAt: timestamp,
        });
      } else {
        await this.db.contactSources.put({
          id: createId(),
          contactId,
          sourceType: 'vcf',
          sourceIdentifier: incoming.sourceIdentifier,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
    return true;
  }
}

function mergePhones(
  current: Contact['phones'],
  incoming: Contact['phones'],
): Contact['phones'] {
  const map = new Map(current.map((p) => [p.normalized, p]));
  for (const phone of incoming) {
    map.set(phone.normalized, phone);
  }
  return [...map.values()];
}

function mergeEmails(
  current: NonNullable<Contact['emails']>,
  incoming: NonNullable<Contact['emails']>,
): NonNullable<Contact['emails']> {
  const map = new Map(current.map((e) => [e.value.trim().toLowerCase(), e]));
  for (const email of incoming) {
    map.set(email.value.trim().toLowerCase(), email);
  }
  return [...map.values()];
}

export function summarizeImport(result: ImportResult): string {
  const parts = [
    `${result.imported} imported`,
    `${result.newContacts} new`,
    `${result.updatedContacts} updated`,
  ];
  if (result.mergedDuplicates) parts.push(`${result.mergedDuplicates} merged`);
  if (result.skippedRecords) parts.push(`${result.skippedRecords} skipped`);
  if (result.relationshipChanges) parts.push(`${result.relationshipChanges} relationship changes`);
  return parts.join(' · ');
}
