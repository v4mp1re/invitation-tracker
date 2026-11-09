import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { telLink, whatsappLink } from './share.ts';

describe('telLink', () => {
  it('keeps digits and a leading plus', () => {
    assert.equal(telLink('+1 (415) 555-0133'), 'tel:+14155550133');
  });
});

describe('whatsappLink', () => {
  it('uses wa.me with digits only', () => {
    assert.equal(whatsappLink('+91 98765 43210'), 'https://wa.me/919876543210');
  });
});
