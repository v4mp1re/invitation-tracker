import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectInstagramFile, parseInstagramFile } from './instagram.ts';

const followers = [
  {
    title: '',
    media_list_data: [],
    string_list_data: [
      {
        href: 'https://www.instagram.com/maalutty96',
        value: 'maalutty96',
        timestamp: 1787839141,
      },
    ],
  },
  {
    title: '',
    string_list_data: [
      {
        href: 'https://www.instagram.com/_u/aswinroopesh',
        value: 'aswinroopesh',
        timestamp: 1787839142,
      },
    ],
  },
];

const following = {
  relationships_following: [
    {
      title: 'aswinroopesh',
      string_list_data: [
        {
          href: 'https://www.instagram.com/_u/aswinroopesh',
          timestamp: 1790550978,
        },
      ],
    },
    {
      title: 'newfriend',
      string_list_data: [
        {
          href: 'https://www.instagram.com/newfriend',
          timestamp: 1790550979,
        },
      ],
    },
  ],
};

describe('Instagram parsers', () => {
  it('parses followers href, username, and timestamp', () => {
    const result = parseInstagramFile(followers, 'followers');
    assert.equal(result.records.length, 2);
    assert.equal(result.records[0].username, 'maalutty96');
    assert.equal(result.records[0].normalizedHref, 'https://www.instagram.com/maalutty96');
    assert.equal(result.records[0].timestamp, new Date(1787839141 * 1000).toISOString());
  });

  it('parses following title and href, normalizing _u URLs', () => {
    const result = parseInstagramFile(following, 'following');
    assert.deepEqual(result.records.map((r) => r.normalizedHref), [
      'https://www.instagram.com/aswinroopesh',
      'https://www.instagram.com/newfriend',
    ]);
    assert.equal(result.records[0].username, 'aswinroopesh');
  });

  it('skips records without href and continues', () => {
    const result = parseInstagramFile(
      [{ title: 'broken', string_list_data: [{ value: 'nope' }] }, followers[0]],
      'followers',
    );
    assert.equal(result.skippedRecords, 1);
    assert.equal(result.records.length, 1);
  });

  it('uses derived username from href when title/value are missing', () => {
    const result = parseInstagramFile(
      [{ string_list_data: [{ href: 'https://www.instagram.com/onlyhref' }] }],
      'followers',
    );
    assert.equal(result.records[0].username, 'onlyhref');
  });

  it('dedupes the same href inside one file', () => {
    const result = parseInstagramFile([followers[0], followers[0]], 'followers');
    assert.equal(result.records.length, 1);
    assert.equal(result.skippedRecords, 1);
  });

  it('rejects a following file on the followers action', () => {
    assert.throws(() => parseInstagramFile(following, 'followers'), /Following export/i);
  });

  it('returns an empty result for an empty followers list', () => {
    const result = parseInstagramFile([], 'followers');
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.errors, []);
  });

  it('detects following objects', () => {
    assert.equal(detectInstagramFile(following), 'following');
  });
});
