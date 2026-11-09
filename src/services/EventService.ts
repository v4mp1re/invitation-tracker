import type { EventRecord } from '../domain/types.ts';
import { createId, nowIso } from '../lib/ids.ts';
import type { InvitationTrackerDB } from '../db/database.ts';
import { EventRepository } from '../db/repositories.ts';

export interface EventInput {
  name: string;
  eventDate?: string;
  description?: string;
  invitationMessage?: string;
  invitationImage?: string | null;
}

export class EventService {
  private readonly events: EventRepository;

  constructor(db: InvitationTrackerDB) {
    this.events = new EventRepository(db);
  }

  list(): Promise<EventRecord[]> {
    return this.events.list();
  }

  get(id: string): Promise<EventRecord | undefined> {
    return this.events.get(id);
  }

  async create(input: EventInput): Promise<EventRecord> {
    const name = input.name.trim();
    if (!name) throw new Error('Event name is required.');
    const timestamp = nowIso();
    const event: EventRecord = {
      id: createId(),
      name,
      eventDate: emptyToUndef(input.eventDate),
      description: emptyToUndef(input.description),
      invitationMessage: emptyToUndef(input.invitationMessage),
      invitationImage: emptyToUndef(input.invitationImage ?? undefined),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.events.put(event);
    return event;
  }

  async update(id: string, input: EventInput): Promise<EventRecord> {
    const existing = await this.events.get(id);
    if (!existing) throw new Error('Event not found.');
    const name = input.name.trim();
    if (!name) throw new Error('Event name is required.');
    const event: EventRecord = {
      ...existing,
      name,
      eventDate: emptyToUndef(input.eventDate),
      description: emptyToUndef(input.description),
      invitationMessage: emptyToUndef(input.invitationMessage),
      invitationImage:
        input.invitationImage === undefined
          ? existing.invitationImage
          : emptyToUndef(input.invitationImage ?? ''),
      updatedAt: nowIso(),
    };
    await this.events.put(event);
    return event;
  }

  async archive(id: string): Promise<EventRecord> {
    const existing = await this.events.get(id);
    if (!existing) throw new Error('Event not found.');
    const event: EventRecord = {
      ...existing,
      archivedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.events.put(event);
    return event;
  }

  async unarchive(id: string): Promise<EventRecord> {
    const existing = await this.events.get(id);
    if (!existing) throw new Error('Event not found.');
    const event: EventRecord = { ...existing, archivedAt: undefined, updatedAt: nowIso() };
    await this.events.put(event);
    return event;
  }
}

function emptyToUndef(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function invitationText(event: EventRecord): string {
  return event.invitationMessage?.trim() || `You're invited to ${event.name}.`;
}
