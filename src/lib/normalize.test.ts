import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  instagramUsernameFromHref,
  normalizeInstagramHref,
  normalizeName,
  normalizePhone,
  searchDigits,
  vcfFingerprint,
  vcfSourceIdentifier,
} from './normalize.ts';

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    assert.equal(normalizeName('  Ada-Lovelace  '), 'ada lovelace');
  });
});

describe('normalizePhone', () => {
  it('keeps digits and a leading plus', () => {
    assert.equal(normalizePhone('+1 (415) 555-0133'), '+14155550133');
    assert.equal(normalizePhone('(415) 555-0133'), '4155550133');
  });
});

describe('searchDigits', () => {
  it('ignores formatting characters', () => {
    assert.equal(searchDigits('+1-415-555-0133'), '14155550133');
  });
});

describe('normalizeInstagramHref', () => {
  it('collapses known URL variations to one identity', () => {
    assert.equal(
      normalizeInstagramHref('https://www.instagram.com/_u/aswinroopesh'),
      'https://www.instagram.com/aswinroopesh',
    );
    assert.equal(
      normalizeInstagramHref('https://instagram.com/aswinroopesh/'),
      'https://www.instagram.com/aswinroopesh',
    );
    assert.equal(
      normalizeInstagramHref('https://www.instagram.com/maalutty96?igsh=abc'),
      'https://www.instagram.com/maalutty96',
    );
    assert.equal(normalizeInstagramHref('https://ig.me/m/aswinroopesh'), 'https://www.instagram.com/aswinroopesh');
  });

  it('does not use a non-profile path as identity', () => {
    assert.equal(normalizeInstagramHref('https://www.instagram.com/p/shortcode'), '');
  });

  it('extracts username from normalized href', () => {
    assert.equal(instagramUsernameFromHref('https://www.instagram.com/_u/Ada'), 'ada');
  });
});

describe('vcf identity helpers', () => {
  it('prefers UID over fingerprint as source identifier', () => {
    const fingerprint = vcfFingerprint({
      normalizedName: 'ada lovelace',
      phones: [{ normalized: '4155550133' }],
      emails: [],
      uid: 'abc-123',
    });
    assert.equal(vcfSourceIdentifier('abc-123', fingerprint), 'uid:abc-123');
    assert.equal(vcfSourceIdentifier(undefined, fingerprint), fingerprint);
  });
});
