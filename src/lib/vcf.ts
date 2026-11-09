import type { EmailAddress, ParsedVcfContact, PhoneNumber } from '../domain/types.ts';
import { normalizeName, normalizePhone, vcfFingerprint, vcfSourceIdentifier } from './normalize.ts';

export interface VcfParseResult {
  contacts: ParsedVcfContact[];
  skipped: number;
  errors: Array<{ message: string; recordIndex?: number }>;
}

export function unfoldVcfLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines.filter((line) => line.trim().length > 0);
}

interface VcfProperty {
  name: string;
  params: Record<string, string[]>;
  value: string;
}

export function parseVcfProperty(line: string): VcfProperty | null {
  const splitAt = findUnquotedColon(line);
  if (splitAt <= 0) return null;
  const left = line.slice(0, splitAt);
  const value = line.slice(splitAt + 1);
  const parts = splitParams(left);
  const rawName = parts.shift() ?? '';
  const name = rawName.replace(/^[^.]+\./, '').toUpperCase();
  if (!name) return null;
  const params: Record<string, string[]> = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      const key = part.toUpperCase();
      params[key] = [...(params[key] ?? []), 'TRUE'];
      continue;
    }
    const key = part.slice(0, eq).toUpperCase();
    const raw = part.slice(eq + 1);
    const values = raw.split(',').map((item) => unquote(item));
    params[key] = [...(params[key] ?? []), ...values];
  }
  return { name, params, value };
}

function findUnquotedColon(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) return i;
  }
  return -1;
}

function splitParams(left: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of left) {
    if (ch === '"') {
      quoted = !quoted;
      current += ch;
    } else if (ch === ';' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function decodeVcfValue(property: VcfProperty): string {
  const encoding = (property.params.ENCODING ?? []).join(',').toUpperCase();
  let value = property.value;
  if (encoding.includes('QUOTED-PRINTABLE')) {
    value = decodeQuotedPrintable(value);
  }
  const charset = (property.params.CHARSET ?? ['utf-8'])[0];
  if (charset && charset.toLowerCase() !== 'utf-8' && charset.toLowerCase() !== 'utf8') {
    try {
      value = new TextDecoder(charset).decode(new TextEncoder().encode(value));
    } catch {
      /* keep decoded string */
    }
  }
  return unescapeVcard(value);
}

function decodeQuotedPrintable(value: string): string {
  const unfolded = value.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i += 1) {
    if (unfolded[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(unfolded.charCodeAt(i));
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function unescapeVcard(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function structuredName(value: string): string {
  const [family, given, additional, prefix, suffix] = value.split(';');
  return [prefix, given, additional, family, suffix]
    .map((part) => unescapeVcard(part ?? '').trim())
    .filter(Boolean)
    .join(' ');
}

function phoneType(params: Record<string, string[]>): string | undefined {
  const types = [...(params.TYPE ?? []), ...(params.LABEL ?? [])]
    .map((t) => t.trim())
    .filter((t) => t && t.toUpperCase() !== 'TRUE');
  return types.length ? types.join(', ') : undefined;
}

function parseTelValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith('tel:')) return trimmed.slice(4);
  return trimmed;
}

export function parseVcf(text: string): VcfParseResult {
  const lines = unfoldVcfLines(text);
  const contacts: ParsedVcfContact[] = [];
  const errors: VcfParseResult['errors'] = [];
  let skipped = 0;
  let current: VcfProperty[] | null = null;
  let recordIndex = 0;

  const flush = () => {
    if (!current) return;
    recordIndex += 1;
    try {
      const parsed = propertiesToContact(current);
      if (!parsed) {
        skipped += 1;
        return;
      }
      contacts.push(parsed);
    } catch {
      skipped += 1;
      errors.push({ message: 'Skipped a malformed vCard record.', recordIndex });
    } finally {
      current = null;
    }
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      current = [];
      continue;
    }
    if (upper === 'END:VCARD') {
      flush();
      continue;
    }
    if (!current) continue;
    const property = parseVcfProperty(line);
    if (property) current.push(property);
  }
  if (current) flush();

  return { contacts, skipped, errors };
}

function propertiesToContact(properties: VcfProperty[]): ParsedVcfContact | null {
  let uid: string | undefined;
  let fn: string | undefined;
  let n: string | undefined;
  const phones: PhoneNumber[] = [];
  const emails: EmailAddress[] = [];

  for (const property of properties) {
    if (property.name === 'VERSION' || property.name === 'PHOTO' || property.name === 'LOGO') {
      continue;
    }
    const value = decodeVcfValue(property);
    if (property.name === 'UID') uid = value.trim() || undefined;
    else if (property.name === 'FN') fn = value.trim() || undefined;
    else if (property.name === 'N') n = value;
    else if (property.name === 'TEL') {
      const display = parseTelValue(value);
      const normalized = normalizePhone(display);
      if (!display || !normalized) continue;
      phones.push({ value: display, normalized, type: phoneType(property.params) });
    } else if (property.name === 'EMAIL') {
      const email = value.trim();
      if (!email) continue;
      emails.push({ value: email, type: phoneType(property.params) });
    }
  }

  const name = (fn || (n ? structuredName(n) : '')).trim();
  if (!name && phones.length === 0 && !uid) return null;

  const uniquePhones = dedupePhones(phones);
  const uniqueEmails = dedupeEmails(emails);
  const displayName = name || uniquePhones[0]?.value || uid || 'Unnamed contact';
  const normalizedName = normalizeName(displayName);
  const fingerprint = vcfFingerprint({
    normalizedName,
    phones: uniquePhones,
    emails: uniqueEmails,
    uid,
  });

  return {
    uid,
    name: displayName,
    normalizedName,
    phones: uniquePhones,
    emails: uniqueEmails,
    fingerprint,
    sourceIdentifier: vcfSourceIdentifier(uid, fingerprint),
  };
}

function dedupePhones(phones: PhoneNumber[]): PhoneNumber[] {
  const seen = new Set<string>();
  const result: PhoneNumber[] = [];
  for (const phone of phones) {
    if (seen.has(phone.normalized)) continue;
    seen.add(phone.normalized);
    result.push(phone);
  }
  return result;
}

function dedupeEmails(emails: EmailAddress[]): EmailAddress[] {
  const seen = new Set<string>();
  const result: EmailAddress[] = [];
  for (const email of emails) {
    const key = email.value.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}

export function collapseVcfDuplicates(contacts: ParsedVcfContact[]): {
  contacts: ParsedVcfContact[];
  mergedDuplicates: number;
} {
  const byKey = new Map<string, ParsedVcfContact>();
  let mergedDuplicates = 0;

  for (const incoming of contacts) {
    const keys = [incoming.sourceIdentifier, incoming.fingerprint, ...incoming.phones.map((p) => `tel:${p.normalized}`)];
    let existing: ParsedVcfContact | undefined;
    for (const key of keys) {
      existing = byKey.get(key);
      if (existing) break;
    }
    if (!existing) {
      for (const key of keys) byKey.set(key, incoming);
      continue;
    }
    mergedDuplicates += 1;
    existing.phones = dedupePhones([...existing.phones, ...incoming.phones]);
    existing.emails = dedupeEmails([...(existing.emails ?? []), ...incoming.emails]);
    if (!existing.uid && incoming.uid) existing.uid = incoming.uid;
    if (incoming.name && existing.name === existing.phones[0]?.value) existing.name = incoming.name;
    existing.sourceIdentifier = vcfSourceIdentifier(existing.uid, existing.fingerprint);
    for (const key of [
      existing.sourceIdentifier,
      existing.fingerprint,
      ...existing.phones.map((p) => `tel:${p.normalized}`),
    ]) {
      byKey.set(key, existing);
    }
  }

  const unique: ParsedVcfContact[] = [];
  const seen = new Set<ParsedVcfContact>();
  for (const contact of byKey.values()) {
    if (seen.has(contact)) continue;
    seen.add(contact);
    unique.push(contact);
  }
  return { contacts: unique, mergedDuplicates };
}
