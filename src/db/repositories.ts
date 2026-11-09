import type { Contact, ContactSource, EventContact, EventRecord, InstagramSource } from '../domain/types.ts';
import type { InvitationTrackerDB } from './database.ts';

export class EventRepository {
  private readonly db: InvitationTrackerDB;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
  }

  list(): Promise<EventRecord[]> {
    return this.db.events.orderBy('createdAt').reverse().toArray();
  }

  get(id: string): Promise<EventRecord | undefined> {
    return this.db.events.get(id);
  }

  put(event: EventRecord): Promise<string> {
    return this.db.events.put(event);
  }
}

export class ContactRepository {
  private readonly db: InvitationTrackerDB;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
  }

  get(id: string): Promise<Contact | undefined> {
    return this.db.contacts.get(id);
  }

  all(): Promise<Contact[]> {
    return this.db.contacts.toArray();
  }

  put(contact: Contact): Promise<string> {
    return this.db.contacts.put(contact);
  }

  bulkPut(contacts: Contact[]): Promise<string> {
    return this.db.contacts.bulkPut(contacts);
  }
}

export class SourceRepository {
  private readonly db: InvitationTrackerDB;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
  }

  byType(sourceType: ContactSource['sourceType']): Promise<ContactSource[]> {
    return this.db.contactSources.where('sourceType').equals(sourceType).toArray();
  }

  byContact(contactId: string): Promise<ContactSource[]> {
    return this.db.contactSources.where('contactId').equals(contactId).toArray();
  }

  all(): Promise<ContactSource[]> {
    return this.db.contactSources.toArray();
  }

  getByIdentity(
    sourceType: ContactSource['sourceType'],
    sourceIdentifier: string,
  ): Promise<ContactSource | undefined> {
    return this.db.contactSources.where('[sourceType+sourceIdentifier]').equals([sourceType, sourceIdentifier]).first();
  }

  put(source: ContactSource): Promise<string> {
    return this.db.contactSources.put(source);
  }

  bulkPut(sources: ContactSource[]): Promise<string> {
    return this.db.contactSources.bulkPut(sources);
  }

  allInstagram(): Promise<InstagramSource[]> {
    return this.db.instagramSources.toArray();
  }

  getInstagram(contactSourceId: string): Promise<InstagramSource | undefined> {
    return this.db.instagramSources.get(contactSourceId);
  }

  getInstagramByHref(normalizedHref: string): Promise<InstagramSource | undefined> {
    return this.db.instagramSources.where('normalizedHref').equals(normalizedHref).first();
  }

  putInstagram(source: InstagramSource): Promise<string> {
    return this.db.instagramSources.put(source);
  }

  bulkPutInstagram(sources: InstagramSource[]): Promise<string> {
    return this.db.instagramSources.bulkPut(sources);
  }
}

export class EventContactRepository {
  private readonly db: InvitationTrackerDB;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
  }

  byEvent(eventId: string): Promise<EventContact[]> {
    return this.db.eventContacts.where('eventId').equals(eventId).toArray();
  }

  getByEventAndContact(eventId: string, contactId: string): Promise<EventContact | undefined> {
    return this.db.eventContacts.where('[eventId+contactId]').equals([eventId, contactId]).first();
  }

  all(): Promise<EventContact[]> {
    return this.db.eventContacts.toArray();
  }

  put(row: EventContact): Promise<string> {
    return this.db.eventContacts.put(row);
  }
}
