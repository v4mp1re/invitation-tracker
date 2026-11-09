import Dexie, { type Table } from 'dexie';
import {
  DATABASE_NAME,
  SCHEMA_VERSION,
  type AppMetadata,
  type Contact,
  type ContactSource,
  type EventContact,
  type EventRecord,
  type InstagramSource,
} from '../domain/types.ts';

export class InvitationTrackerDB extends Dexie {
  events!: Table<EventRecord, string>;
  contacts!: Table<Contact, string>;
  contactSources!: Table<ContactSource, string>;
  instagramSources!: Table<InstagramSource, string>;
  eventContacts!: Table<EventContact, string>;
  appMetadata!: Table<AppMetadata, string>;

  constructor(name = DATABASE_NAME) {
    super(name);
    this.version(1).stores({
      events: 'id, createdAt, name, archivedAt',
      contacts: 'id, normalizedName, lastSeenImportAt',
      contactSources: 'id, contactId, sourceType, [sourceType+sourceIdentifier], sourceIdentifier',
      instagramSources: 'contactSourceId, normalizedHref, username',
      eventContacts: 'id, eventId, contactId, [eventId+status], &[eventId+contactId], invitedAt',
      appMetadata: 'key',
    });
  }
}

export function createDatabase(name = DATABASE_NAME): InvitationTrackerDB {
  return new InvitationTrackerDB(name);
}

export const db = createDatabase();

export async function ensureMetadata(database: InvitationTrackerDB = db): Promise<void> {
  const existing = await database.appMetadata.get('schemaVersion');
  if (!existing) {
    await database.appMetadata.put({ key: 'schemaVersion', value: String(SCHEMA_VERSION) });
  }
}
