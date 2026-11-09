import type { ImportError, ParsedInstagramRecord } from '../domain/types.ts';
import {
  instagramProfileUrl,
  instagramUsernameFromHref,
  normalizeInstagramHref,
  normalizeUsername,
} from './normalize.ts';
import { unixToIso } from './ids.ts';

export type InstagramFileKind = 'followers' | 'following' | 'unknown';

interface StringListItem {
  href?: unknown;
  value?: unknown;
  timestamp?: unknown;
}

interface RelationshipNode {
  title?: unknown;
  string_list_data?: unknown;
}

export interface InstagramParseResult {
  records: ParsedInstagramRecord[];
  skippedRecords: number;
  errors: ImportError[];
  detectedKind: InstagramFileKind;
}

export function detectInstagramFile(data: unknown): InstagramFileKind {
  if (Array.isArray(data)) return 'unknown';
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.relationships_following)) return 'following';
    if (Array.isArray(obj.relationships_followers)) return 'followers';
    if (Array.isArray(obj.followers)) return 'followers';
    if (Array.isArray(obj.following)) return 'following';
  }
  return 'unknown';
}

export function parseInstagramFile(
  data: unknown,
  expected: 'followers' | 'following',
): InstagramParseResult {
  const detectedKind = detectInstagramFile(data);
  if (detectedKind !== 'unknown' && detectedKind !== expected) {
    const label = expected === 'followers' ? 'Followers' : 'Following';
    const other = expected === 'followers' ? 'Following' : 'Followers';
    throw new Error(`This file looks like an Instagram ${other} export. Use Import ${other} instead of Import ${label}.`);
  }

  const nodes = extractNodes(data, expected);
  const records: ParsedInstagramRecord[] = [];
  const errors: ImportError[] = [];
  let skippedRecords = 0;
  const seen = new Set<string>();

  nodes.forEach((node, index) => {
    try {
      const parsed = parseNode(node);
      if (!parsed) {
        skippedRecords += 1;
        errors.push({
          message: 'Skipped a record without a usable Instagram href.',
          recordIndex: index,
        });
        return;
      }
      if (seen.has(parsed.normalizedHref)) {
        skippedRecords += 1;
        return;
      }
      seen.add(parsed.normalizedHref);
      records.push(parsed);
    } catch {
      skippedRecords += 1;
      errors.push({
        message: 'Skipped a malformed Instagram record.',
        recordIndex: index,
      });
    }
  });

  return { records, skippedRecords, errors, detectedKind: detectedKind === 'unknown' ? expected : detectedKind };
}

function extractNodes(data: unknown, expected: 'followers' | 'following'): RelationshipNode[] {
  if (Array.isArray(data)) return data as RelationshipNode[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const fromFollowing = obj.relationships_following;
    const fromFollowers = obj.relationships_followers ?? obj.followers;
    const fromAltFollowing = obj.following;
    if (expected === 'following' && Array.isArray(fromFollowing)) return fromFollowing as RelationshipNode[];
    if (expected === 'following' && Array.isArray(fromAltFollowing)) return fromAltFollowing as RelationshipNode[];
    if (expected === 'followers' && Array.isArray(fromFollowers)) return fromFollowers as RelationshipNode[];
  }
  throw new Error('This Instagram JSON file does not match the expected export format.');
}

function parseNode(node: RelationshipNode): ParsedInstagramRecord | null {
  if (!node || typeof node !== 'object') return null;
  const list = Array.isArray(node.string_list_data) ? (node.string_list_data as StringListItem[]) : [];
  const item = list.find((entry) => typeof entry?.href === 'string' && entry.href.trim()) ?? list[0];
  const href = typeof item?.href === 'string' ? item.href : '';
  const normalizedHref = normalizeInstagramHref(href);
  if (!normalizedHref) return null;

  const title = typeof node.title === 'string' ? node.title : '';
  const value = typeof item?.value === 'string' ? item.value : '';
  const username =
    normalizeUsername(value) ||
    normalizeUsername(title) ||
    instagramUsernameFromHref(normalizedHref);
  if (!username) return null;

  const timestampRaw = item?.timestamp;
  let timestamp: string | undefined;
  if (typeof timestampRaw === 'number') timestamp = unixToIso(timestampRaw);
  else if (typeof timestampRaw === 'string' && timestampRaw.trim()) {
    const asNumber = Number(timestampRaw);
    if (!Number.isNaN(asNumber)) timestamp = unixToIso(asNumber);
  }

  return {
    href,
    normalizedHref,
    username,
    profileUrl: instagramProfileUrl(href, normalizedHref),
    timestamp,
  };
}

export function parseInstagramJsonText(
  text: string,
  expected: 'followers' | 'following',
): InstagramParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  return parseInstagramFile(data, expected);
}
