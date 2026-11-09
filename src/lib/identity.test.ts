import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Contact, ContactSource, ParsedVcfContact } from '../domain/types.ts';
import { buildIdentityIndexes, resolveVcfContact } from './identity.ts';
import { parseInstagramFile } from './instagram.ts';

function contact(partial: Partial<Contact> & Pick<Contact, 'id' | 'name'>): Contact {
  return {
    normalizedName: partial.name.toLowerCase(),
    phones: [],
    emails: [],
    createdAt: 't',
    updatedAt: 't',
    ...partial,
  };
}

describe('VCF identity resolution', () => {
  const existing = contact({
    id: 'c1',
    name: 'Ada Lovelace',
    normalizedName: 'ada lovelace',
    phones: [{ value: '+1 415 555 0133', normalized: '+14155550133' }],
  });
  const source: ContactSource = {
    id: 's1',
    contactId: 'c1',
    sourceType: 'vcf',
    sourceIdentifier: 'uid:abc',
    createdAt: 't',
    updatedAt: 't',
  };

  it('matches UID first', () => {
    const indexes = buildIdentityIndexes([existing], [source]);
    const incoming: ParsedVcfContact = {
      uid: 'abc',
      name: 'Ada',
      normalizedName: 'ada',
      phones: [{ value: '999', normalized: '999' }],
      emails: [],
      fingerprint: 'fp:x',
      sourceIdentifier: 'uid:abc',
    };
    assert.deepEqual(resolveVcfContact(incoming, indexes), { action: 'update', contactId: 'c1' });
  });

  it('matches a unique normalized phone', () => {
    const indexes = buildIdentityIndexes([existing], []);
    const incoming: ParsedVcfContact = {
      name: 'Someone Else',
      normalizedName: 'someone else',
      phones: [{ value: '+1 (415) 555-0133', normalized: '+14155550133' }],
      emails: [],
      fingerprint: 'fp:y',
      sourceIdentifier: 'fp:y',
    };
    assert.deepEqual(resolveVcfContact(incoming, indexes), { action: 'update', contactId: 'c1' });
  });

  it('reviews when a phone matches more than one contact', () => {
    const other = contact({
      id: 'c2',
      name: 'Other Ada',
      phones: [{ value: '4155550133', normalized: '+14155550133' }],
    });
    const indexes = buildIdentityIndexes([existing, other], []);
    const incoming: ParsedVcfContact = {
      name: 'Ada',
      normalizedName: 'ada',
      phones: [{ value: '+14155550133', normalized: '+14155550133' }],
      emails: [],
      fingerprint: 'fp:z',
      sourceIdentifier: 'fp:z',
    };
    assert.equal(resolveVcfContact(incoming, indexes).action, 'review');
  });

  it('reviews same name with different phones as a possible duplicate', () => {
    const indexes = buildIdentityIndexes([existing], []);
    const incoming: ParsedVcfContact = {
      name: 'Ada Lovelace',
      normalizedName: 'ada lovelace',
      phones: [{ value: '999', normalized: '999' }],
      emails: [],
      fingerprint: 'fp:q',
      sourceIdentifier: 'fp:q',
    };
    assert.equal(resolveVcfContact(incoming, indexes).action, 'review');
  });
});

describe('cross-source separation', () => {
  it('does not treat equal names as the same person across Instagram and VCF', () => {
    const ig = parseInstagramFile(
      [{ string_list_data: [{ href: 'https://www.instagram.com/ada_lovelace', value: 'ada_lovelace' }] }],
      'followers',
    );
    assert.equal(ig.records[0].username, 'ada_lovelace');
    assert.notEqual(ig.records[0].normalizedHref, 'ada lovelace');
  });
});
