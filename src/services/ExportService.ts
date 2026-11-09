import type {
  BackupPayload,
  Contact,
  ContactSource,
  EventContact,
  EventRecord,
  InstagramSource,
} from '../domain/types.ts';
import { SCHEMA_VERSION } from '../domain/types.ts';
import { nowIso } from '../lib/ids.ts';
import { toCsv } from '../lib/share.ts';
import type { InvitationTrackerDB } from '../db/database.ts';
import {
  ContactRepository,
  EventContactRepository,
  EventRepository,
  SourceRepository,
} from '../db/repositories.ts';

export class ExportService {
  private readonly db: InvitationTrackerDB;
  private readonly events: EventRepository;
  private readonly contacts: ContactRepository;
  private readonly sources: SourceRepository;
  private readonly eventContacts: EventContactRepository;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
    this.events = new EventRepository(db);
    this.contacts = new ContactRepository(db);
    this.sources = new SourceRepository(db);
    this.eventContacts = new EventContactRepository(db);
  }

  async exportJson(): Promise<BackupPayload> {
    const [events, contacts, contactSources, instagramSources, eventContacts] = await Promise.all([
      this.events.list(),
      this.contacts.all(),
      this.sources.all(),
      this.sources.allInstagram(),
      this.eventContacts.all(),
    ]);
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: nowIso(),
      events,
      contacts,
      contactSources,
      instagramSources,
      eventContacts,
    };
  }

  async exportCsv(): Promise<string> {
    const payload = await this.exportJson();
    const sourcesByContact = groupSources(payload.contactSources);
    const igBySource = new Map(payload.instagramSources.map((ig) => [ig.contactSourceId, ig]));

    const inviteKey = new Map(
      payload.eventContacts.map((row) => [`${row.eventId}:${row.contactId}`, row] as const),
    );
    const rows: string[][] = [];
    for (const event of payload.events) {
      for (const contact of payload.contacts) {
        const contactSources = sourcesByContact.get(contact.id) ?? [];
        if (contactSources.length === 0) continue;
        const invitation = inviteKey.get(`${event.id}:${contact.id}`);
        const source = pickSource(contactSources, invitation?.invitedVia);
        const ig = source?.sourceType === 'instagram' ? igBySource.get(source.id) : undefined;
        rows.push([
          event.name,
          event.eventDate ?? '',
          source?.sourceType ?? '',
          contact.name,
          contact.phones.map((p) => p.value).join(';'),
          ig?.username ?? '',
          ig?.profileUrl ?? ig?.href ?? '',
          invitation?.status ?? 'pending',
          invitation?.invitedAt ?? '',
          invitation?.invitedVia ?? '',
          invitation?.invitedPhone ?? '',
        ]);
      }
    }

    return toCsv(
      [
        'event_name',
        'event_date',
        'contact_source',
        'contact_name',
        'phone',
        'instagram_username',
        'instagram_profile',
        'status',
        'invited_at',
        'invited_via',
        'invited_phone',
      ],
      rows,
    );
  }

  validateBackup(raw: unknown): BackupPayload {
    if (!raw || typeof raw !== 'object') throw new Error('Backup file is not valid JSON.');
    const data = raw as Partial<BackupPayload>;
    if (data.schemaVersion !== SCHEMA_VERSION) {
      throw new Error(`Unsupported backup schemaVersion ${String(data.schemaVersion)}. Expected ${SCHEMA_VERSION}.`);
    }
    if (
      !Array.isArray(data.events) ||
      !Array.isArray(data.contacts) ||
      !Array.isArray(data.contactSources) ||
      !Array.isArray(data.instagramSources) ||
      !Array.isArray(data.eventContacts)
    ) {
      throw new Error('Backup is missing required collections.');
    }
    return data as BackupPayload;
  }

  async restore(payload: BackupPayload): Promise<void> {
    const valid = this.validateBackup(payload);
    await this.db.transaction(
      'rw',
      [
        this.db.events,
        this.db.contacts,
        this.db.contactSources,
        this.db.instagramSources,
        this.db.eventContacts,
        this.db.appMetadata,
      ],
      async () => {
        await Promise.all([
          this.db.events.clear(),
          this.db.contacts.clear(),
          this.db.contactSources.clear(),
          this.db.instagramSources.clear(),
          this.db.eventContacts.clear(),
        ]);
        await this.db.events.bulkPut(valid.events as EventRecord[]);
        await this.db.contacts.bulkPut(valid.contacts as Contact[]);
        await this.db.contactSources.bulkPut(valid.contactSources as ContactSource[]);
        await this.db.instagramSources.bulkPut(valid.instagramSources as InstagramSource[]);
        await this.db.eventContacts.bulkPut(valid.eventContacts as EventContact[]);
        await this.db.appMetadata.put({ key: 'schemaVersion', value: String(SCHEMA_VERSION) });
        await this.db.appMetadata.put({ key: 'restoredAt', value: nowIso() });
      },
    );
  }

  async deleteAllData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.events,
        this.db.contacts,
        this.db.contactSources,
        this.db.instagramSources,
        this.db.eventContacts,
        this.db.appMetadata,
      ],
      async () => {
        await Promise.all([
          this.db.events.clear(),
          this.db.contacts.clear(),
          this.db.contactSources.clear(),
          this.db.instagramSources.clear(),
          this.db.eventContacts.clear(),
        ]);
        await this.db.appMetadata.put({ key: 'schemaVersion', value: String(SCHEMA_VERSION) });
        await this.db.appMetadata.put({ key: 'clearedAt', value: nowIso() });
      },
    );
  }
}

function groupSources(sources: ContactSource[]): Map<string, ContactSource[]> {
  const map = new Map<string, ContactSource[]>();
  for (const source of sources) {
    const list = map.get(source.contactId) ?? [];
    list.push(source);
    map.set(source.contactId, list);
  }
  return map;
}

function pickSource(sources: ContactSource[], invitedVia?: string): ContactSource | undefined {
  if (invitedVia === 'instagram') return sources.find((s) => s.sourceType === 'instagram') ?? sources[0];
  if (invitedVia === 'phone') return sources.find((s) => s.sourceType === 'vcf') ?? sources[0];
  return sources[0];
}
