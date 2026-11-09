import { db } from '../db/database.ts';
import { ContactService } from './ContactService.ts';
import { EventService } from './EventService.ts';
import { ExportService } from './ExportService.ts';
import { ImportService } from './ImportService.ts';
import { InvitationService } from './InvitationService.ts';

export const eventService = new EventService(db);
export const contactService = new ContactService(db);
export const invitationService = new InvitationService(db);
export const importService = new ImportService(db);
export const exportService = new ExportService(db);
