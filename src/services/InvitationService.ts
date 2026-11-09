import type { Contact, EventContact, InviteChannel } from '../domain/types.ts';
import { createId, nowIso } from '../lib/ids.ts';
import { phoneBelongsToContact } from '../lib/normalize.ts';
import type { InvitationTrackerDB } from '../db/database.ts';
import { ContactRepository, EventContactRepository, EventRepository } from '../db/repositories.ts';

export class InvitationService {
  private readonly db: InvitationTrackerDB;
  private readonly events: EventRepository;
  private readonly contacts: ContactRepository;
  private readonly eventContacts: EventContactRepository;

  constructor(db: InvitationTrackerDB) {
    this.db = db;
    this.events = new EventRepository(db);
    this.contacts = new ContactRepository(db);
    this.eventContacts = new EventContactRepository(db);
  }

  async getOrCreatePending(eventId: string, contactId: string): Promise<EventContact> {
    const existing = await this.eventContacts.getByEventAndContact(eventId, contactId);
    if (existing) return existing;
    const event = await this.events.get(eventId);
    const contact = await this.contacts.get(contactId);
    if (!event || !contact) throw new Error('Event or contact is missing.');
    const timestamp = nowIso();
    const row: EventContact = {
      id: createId(),
      eventId,
      contactId,
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.eventContacts.put(row);
    return row;
  }

  /**
   * Invite starts delivery only. Persisted status stays pending until markInvited.
   */
  async beginDelivery(eventId: string, contactId: string): Promise<EventContact> {
    return this.getOrCreatePending(eventId, contactId);
  }

  async markInvited(input: {
    eventId: string;
    contactId: string;
    invitedVia: InviteChannel;
    invitedPhone?: string;
  }): Promise<EventContact> {
    const contact = await this.requireContact(input.contactId);
    if (input.invitedVia === 'phone' && input.invitedPhone) {
      if (!phoneBelongsToContact(contact.phones, input.invitedPhone)) {
        throw new Error('The selected phone number does not belong to this contact.');
      }
    }

    return this.db.transaction('rw', this.db.eventContacts, this.db.events, this.db.contacts, async () => {
      const existing = await this.getOrCreatePending(input.eventId, input.contactId);
      const timestamp = nowIso();
      const invited: EventContact = {
        ...existing,
        status: 'invited',
        invitedAt: timestamp,
        invitedVia: input.invitedVia,
        invitedPhone: input.invitedVia === 'phone' ? input.invitedPhone : undefined,
        updatedAt: timestamp,
      };
      await this.eventContacts.put(invited);
      return invited;
    });
  }

  async markNotAnswered(eventId: string, contactId: string): Promise<EventContact> {
    return this.db.transaction('rw', this.db.eventContacts, this.db.events, this.db.contacts, async () => {
      const existing = await this.getOrCreatePending(eventId, contactId);
      const timestamp = nowIso();
      const row: EventContact = {
        ...existing,
        status: 'not_answered',
        invitedAt: undefined,
        invitedVia: undefined,
        invitedPhone: undefined,
        updatedAt: timestamp,
      };
      await this.eventContacts.put(row);
      return row;
    });
  }

  async undo(eventId: string, contactId: string): Promise<EventContact> {
    return this.db.transaction('rw', this.db.eventContacts, async () => {
      const existing = await this.eventContacts.getByEventAndContact(eventId, contactId);
      if (!existing) throw new Error('Invitation record not found.');
      const pending: EventContact = {
        ...existing,
        status: 'pending',
        invitedAt: undefined,
        invitedVia: undefined,
        invitedPhone: undefined,
        updatedAt: nowIso(),
      };
      await this.eventContacts.put(pending);
      return pending;
    });
  }

  private async requireContact(contactId: string): Promise<Contact> {
    const contact = await this.contacts.get(contactId);
    if (!contact) throw new Error('Contact not found.');
    return contact;
  }
}
