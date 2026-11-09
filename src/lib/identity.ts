import type {
  Contact,
  ContactSource,
  DuplicateCandidate,
  DuplicateReviewItem,
  ParsedVcfContact,
  VcfImportPlan,
} from '../domain/types.ts';

export interface IdentityIndexes {
  contactsById: Map<string, Contact>;
  vcfSources: ContactSource[];
  bySourceIdentifier: Map<string, ContactSource>;
  byPhone: Map<string, string[]>;
  byNamePhone: Map<string, string[]>;
  byFingerprint: Map<string, string[]>;
  byName: Map<string, string[]>;
}

export function buildIdentityIndexes(contacts: Contact[], vcfSources: ContactSource[]): IdentityIndexes {
  const contactsById = new Map(contacts.map((c) => [c.id, c]));
  const bySourceIdentifier = new Map<string, ContactSource>();
  for (const source of vcfSources) {
    bySourceIdentifier.set(source.sourceIdentifier, source);
  }

  const byPhone = new Map<string, string[]>();
  const byNamePhone = new Map<string, string[]>();
  const byFingerprint = new Map<string, string[]>();
  const byName = new Map<string, string[]>();

  for (const contact of contacts) {
    push(byName, contact.normalizedName, contact.id);
    for (const phone of contact.phones) {
      if (!phone.normalized) continue;
      push(byPhone, phone.normalized, contact.id);
      push(byNamePhone, `${contact.normalizedName}|${phone.normalized}`, contact.id);
    }
    const fpSource = vcfSources.find(
      (source) => source.contactId === contact.id && source.sourceIdentifier.startsWith('fp:'),
    );
    if (fpSource) push(byFingerprint, fpSource.sourceIdentifier, contact.id);
  }

  return {
    contactsById,
    vcfSources,
    bySourceIdentifier,
    byPhone,
    byNamePhone,
    byFingerprint,
    byName,
  };
}

function push(map: Map<string, string[]>, key: string, id: string): void {
  if (!key) return;
  const current = map.get(key) ?? [];
  if (!current.includes(id)) current.push(id);
  map.set(key, current);
}

export type VcfMatch =
  | { action: 'create' }
  | { action: 'update'; contactId: string }
  | { action: 'review'; candidates: DuplicateCandidate[] };

export function resolveVcfContact(incoming: ParsedVcfContact, indexes: IdentityIndexes): VcfMatch {
  const uidSource = indexes.bySourceIdentifier.get(incoming.sourceIdentifier);
  if (uidSource && indexes.contactsById.has(uidSource.contactId)) {
    return { action: 'update', contactId: uidSource.contactId };
  }

  const phoneHits = uniqueIds(
    incoming.phones.flatMap((phone) => indexes.byPhone.get(phone.normalized) ?? []),
  );
  if (phoneHits.length === 1) {
    return { action: 'update', contactId: phoneHits[0] };
  }
  if (phoneHits.length > 1) {
    return { action: 'review', candidates: toCandidates(phoneHits, indexes) };
  }

  const namePhoneHits = uniqueIds(
    incoming.phones.flatMap(
      (phone) => indexes.byNamePhone.get(`${incoming.normalizedName}|${phone.normalized}`) ?? [],
    ),
  );
  if (namePhoneHits.length === 1) {
    return { action: 'update', contactId: namePhoneHits[0] };
  }
  if (namePhoneHits.length > 1) {
    return { action: 'review', candidates: toCandidates(namePhoneHits, indexes) };
  }

  const fingerprintHits = indexes.byFingerprint.get(incoming.fingerprint) ?? [];
  if (fingerprintHits.length === 1) {
    return { action: 'update', contactId: fingerprintHits[0] };
  }
  if (fingerprintHits.length > 1) {
    return { action: 'review', candidates: toCandidates(fingerprintHits, indexes) };
  }

  const nameHits = (indexes.byName.get(incoming.normalizedName) ?? []).filter((id) => {
    const contact = indexes.contactsById.get(id);
    return Boolean(contact && contact.phones.length > 0);
  });
  if (nameHits.length > 0) {
    return { action: 'review', candidates: toCandidates(nameHits, indexes) };
  }

  return { action: 'create' };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function toCandidates(ids: string[], indexes: IdentityIndexes): DuplicateCandidate[] {
  return ids
    .map((id) => indexes.contactsById.get(id))
    .filter((contact): contact is Contact => Boolean(contact))
    .map((contact) => ({
      contactId: contact.id,
      name: contact.name,
      phones: contact.phones.map((p) => p.value),
    }));
}

export function planVcfImport(
  incoming: ParsedVcfContact[],
  indexes: IdentityIndexes,
  totalRecords: number,
  skippedRecords: number,
  errors: VcfImportPlan['errors'],
  mergedDuplicates: number,
): VcfImportPlan {
  const toCreate: ParsedVcfContact[] = [];
  const toUpdate: VcfImportPlan['toUpdate'] = [];
  const reviews: DuplicateReviewItem[] = [];

  incoming.forEach((record, index) => {
    const match = resolveVcfContact(record, indexes);
    if (match.action === 'create') toCreate.push(record);
    else if (match.action === 'update') toUpdate.push({ contactId: match.contactId, incoming: record });
    else {
      reviews.push({
        key: `${record.sourceIdentifier}:${index}`,
        incoming: record,
        candidates: match.candidates,
        defaultAction: 'create',
      });
    }
  });

  return {
    toCreate,
    toUpdate,
    reviews,
    mergedDuplicates,
    skippedRecords,
    errors,
    totalRecords,
  };
}
