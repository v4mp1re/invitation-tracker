import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collapseVcfDuplicates, parseVcf, unfoldVcfLines } from './vcf.ts';

describe('unfoldVcfLines', () => {
  it('joins folded lines', () => {
    const text = 'FN:Ada\n  Lovelace\nTEL;TYPE=CELL:+1 415\n  555 0133\n';
    assert.deepEqual(unfoldVcfLines(text), ['FN:Ada Lovelace', 'TEL;TYPE=CELL:+1 415 555 0133']);
  });
});

describe('parseVcf', () => {
  it('parses FN, TEL types, UID, and emails', () => {
    const text = `BEGIN:VCARD
VERSION:3.0
UID:abc-123
FN:Ada Lovelace
N:Lovelace;Ada;;;
TEL;TYPE=CELL:+1 415-555-0133
TEL;TYPE=HOME:(415) 555-0199
EMAIL;TYPE=INTERNET:ada@example.com
END:VCARD`;
    const result = parseVcf(text);
    assert.equal(result.contacts.length, 1);
    assert.equal(result.contacts[0].uid, 'abc-123');
    assert.equal(result.contacts[0].name, 'Ada Lovelace');
    assert.deepEqual(result.contacts[0].phones.map((p) => p.normalized), ['+14155550133', '4155550199']);
    assert.match(result.contacts[0].phones[0].type ?? '', /CELL/i);
    assert.equal(result.contacts[0].emails[0].value, 'ada@example.com');
    assert.equal(result.contacts[0].sourceIdentifier, 'uid:abc-123');
  });

  it('uses structured name when FN is missing', () => {
    const text = `BEGIN:VCARD
VERSION:3.0
N:Hopper;Grace;;;
TEL:5550100
END:VCARD`;
    assert.equal(parseVcf(text).contacts[0].name, 'Grace Hopper');
  });

  it('returns an empty result for empty input', () => {
    assert.deepEqual(parseVcf('').contacts, []);
    assert.deepEqual(parseVcf('').errors, []);
  });

  it('ignores unsupported fields and continues', () => {
    const text = `BEGIN:VCARD
VERSION:3.0
FN:Test Person
X-ABUID:not-used
PHOTO;ENCODING=b:aaaa
TEL:5550101
END:VCARD`;
    assert.equal(parseVcf(text).contacts[0].name, 'Test Person');
  });
});

describe('collapseVcfDuplicates', () => {
  it('merges repeated records with the same UID', () => {
    const parsed = parseVcf(`BEGIN:VCARD
VERSION:3.0
UID:same
FN:Ada
TEL:111
END:VCARD
BEGIN:VCARD
VERSION:3.0
UID:same
FN:Ada
TEL:222
END:VCARD`);
    const collapsed = collapseVcfDuplicates(parsed.contacts);
    assert.equal(collapsed.contacts.length, 1);
    assert.equal(collapsed.mergedDuplicates, 1);
    assert.equal(collapsed.contacts[0].phones.length, 2);
  });
});
