import type {
  Contact,
  ContactSource,
  EventContact,
  InstagramRelationFilter,
  InstagramSource,
  InvitationFilter,
} from '../domain/types.ts';
import { normalizeUsername, searchDigits } from '../lib/normalize.ts';
import type { InvitationTrackerDB } from '../db/database.ts';
import { ContactRepository, EventContactRepository, SourceRepository } from '../db/repositories.ts';

export interface PhoneContactRow {
  contact: Contact;
  source: ContactSource;
  invitation?: EventContact;
  status: EventContact['status'];
}

export interface InstagramContactRow {
  contact: Contact;
  source: ContactSource;
  instagram: InstagramSource;
  invitation?: EventContact;
  status: EventContact['status'];
}

export class ContactService {
  private readonly contacts: ContactRepository;
  private readonly sources: SourceRepository;
  private readonly eventContacts: EventContactRepository;

  constructor(db: InvitationTrackerDB) {
    this.contacts = new ContactRepository(db);
    this.sources = new SourceRepository(db);
    this.eventContacts = new EventContactRepository(db);
  }

  async phoneRows(eventId?: string): Promise<PhoneContactRow[]> {
    const [contacts, sources, invitations] = await Promise.all([
      this.contacts.all(),
      this.sources.byType('vcf'),
      eventId ? this.eventContacts.byEvent(eventId) : Promise.resolve([]),
    ]);
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const inviteByContact = new Map(invitations.map((row) => [row.contactId, row]));
    const rows: PhoneContactRow[] = [];
    for (const source of sources) {
      const contact = byId.get(source.contactId);
      if (!contact) continue;
      const invitation = inviteByContact.get(contact.id);
      rows.push({
        contact,
        source,
        invitation,
        status: invitation?.status ?? 'pending',
      });
    }
    rows.sort((a, b) => a.contact.name.localeCompare(b.contact.name, undefined, { sensitivity: 'base' }));
    return rows;
  }

  async instagramRows(eventId?: string): Promise<InstagramContactRow[]> {
    const [contacts, sources, instagram, invitations] = await Promise.all([
      this.contacts.all(),
      this.sources.byType('instagram'),
      this.sources.allInstagram(),
      eventId ? this.eventContacts.byEvent(eventId) : Promise.resolve([]),
    ]);
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const igBySource = new Map(instagram.map((row) => [row.contactSourceId, row]));
    const inviteByContact = new Map(invitations.map((row) => [row.contactId, row]));
    const rows: InstagramContactRow[] = [];
    for (const source of sources) {
      const contact = byId.get(source.contactId);
      const ig = igBySource.get(source.id);
      if (!contact || !ig) continue;
      const invitation = inviteByContact.get(contact.id);
      rows.push({
        contact,
        source,
        instagram: ig,
        invitation,
        status: invitation?.status ?? 'pending',
      });
    }
    rows.sort((a, b) =>
      a.instagram.username.localeCompare(b.instagram.username, undefined, { sensitivity: 'base' }),
    );
    return rows;
  }
}

export function filterPhoneRows(
  rows: PhoneContactRow[],
  query: string,
  status: InvitationFilter,
): PhoneContactRow[] {
  const q = query.trim().toLowerCase();
  const digits = searchDigits(query);
  return rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (!q && !digits) return true;
    const nameHit = row.contact.name.toLowerCase().includes(q) || row.contact.normalizedName.includes(q);
    const phoneHit = row.contact.phones.some(
      (phone) => phone.value.toLowerCase().includes(q) || (digits && phone.normalized.includes(digits)),
    );
    return nameHit || phoneHit;
  });
}

export function filterInstagramRows(
  rows: InstagramContactRow[],
  query: string,
  relation: InstagramRelationFilter,
  status: InvitationFilter,
): InstagramContactRow[] {
  const q = normalizeUsername(query);
  return rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (relation === 'followers' && !row.instagram.isFollower) return false;
    if (relation === 'following' && !row.instagram.isFollowing) return false;
    if (relation === 'both' && !(row.instagram.isFollower && row.instagram.isFollowing)) return false;
    if (!q) return true;
    return (
      normalizeUsername(row.instagram.username).includes(q) ||
      row.instagram.normalizedHref.toLowerCase().includes(q) ||
      row.instagram.href.toLowerCase().includes(q)
    );
  });
}

export function relationLabel(ig: InstagramSource): string {
  if (ig.isFollower && ig.isFollowing) return 'Follower + Following';
  if (ig.isFollower) return 'Follower';
  if (ig.isFollowing) return 'Following';
  return 'Instagram';
}

export function counts<T extends { status: EventContact['status'] }>(rows: T[]): {
  total: number;
  pending: number;
  invited: number;
  notAnswered: number;
} {
  let invited = 0;
  let notAnswered = 0;
  for (const row of rows) {
    if (row.status === 'invited') invited += 1;
    else if (row.status === 'not_answered') notAnswered += 1;
  }
  return {
    total: rows.length,
    invited,
    notAnswered,
    pending: rows.length - invited - notAnswered,
  };
}

export function invitationFilterLabel(value: InvitationFilter): string {
  if (value === 'not_answered') return 'Not answered';
  return value[0].toUpperCase() + value.slice(1);
}
