export type SourceType = 'vcf' | 'instagram';
export type InvitationStatus = 'pending' | 'invited' | 'not_answered';
export type InviteChannel = 'phone' | 'instagram';
export type InstagramRelationFilter = 'all' | 'followers' | 'following' | 'both';
export type InvitationFilter = 'all' | 'pending' | 'invited' | 'not_answered';
export type ImportSource =
  | 'vcf'
  | 'instagram-followers'
  | 'instagram-following';

export interface PhoneNumber {
  value: string;
  normalized: string;
  type?: string;
}

export interface EmailAddress {
  value: string;
  type?: string;
}

export interface EventRecord {
  id: string;
  name: string;
  eventDate?: string;
  description?: string;
  invitationMessage?: string;
  invitationImage?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Contact {
  id: string;
  name: string;
  normalizedName: string;
  phones: PhoneNumber[];
  emails?: EmailAddress[];
  createdAt: string;
  updatedAt: string;
  lastSeenImportAt?: string;
}

export interface ContactSource {
  id: string;
  contactId: string;
  sourceType: SourceType;
  sourceIdentifier: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramSource {
  contactSourceId: string;
  href: string;
  normalizedHref: string;
  username: string;
  profileUrl: string;
  isFollower: boolean;
  isFollowing: boolean;
  followerSince?: string;
  followingSince?: string;
  profileImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventContact {
  id: string;
  eventId: string;
  contactId: string;
  status: InvitationStatus;
  invitedAt?: string;
  invitedVia?: InviteChannel;
  invitedPhone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppMetadata {
  key: string;
  value: string;
}

export interface ImportError {
  message: string;
  recordIndex?: number;
  identifier?: string;
}

export interface ImportResult {
  source: ImportSource;
  totalRecords: number;
  imported: number;
  newContacts: number;
  updatedContacts: number;
  mergedDuplicates: number;
  possibleDuplicates: number;
  skippedRecords: number;
  relationshipChanges?: number;
  errors: ImportError[];
}

export interface ParsedVcfContact {
  uid?: string;
  name: string;
  normalizedName: string;
  phones: PhoneNumber[];
  emails: EmailAddress[];
  fingerprint: string;
  sourceIdentifier: string;
}

export interface ParsedInstagramRecord {
  href: string;
  normalizedHref: string;
  username: string;
  profileUrl: string;
  timestamp?: string;
}

export interface DuplicateCandidate {
  contactId: string;
  name: string;
  phones: string[];
}

export type DuplicateResolutionAction = 'merge' | 'create';

export interface DuplicateReviewItem {
  key: string;
  incoming: ParsedVcfContact;
  candidates: DuplicateCandidate[];
  defaultAction: DuplicateResolutionAction;
}

export interface VcfImportPlan {
  toCreate: ParsedVcfContact[];
  toUpdate: Array<{ contactId: string; incoming: ParsedVcfContact }>;
  reviews: DuplicateReviewItem[];
  mergedDuplicates: number;
  skippedRecords: number;
  errors: ImportError[];
  totalRecords: number;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  events: EventRecord[];
  contacts: Contact[];
  contactSources: ContactSource[];
  instagramSources: InstagramSource[];
  eventContacts: EventContact[];
}

export const SCHEMA_VERSION = 2;
export const DATABASE_NAME = 'invitation-tracker';
