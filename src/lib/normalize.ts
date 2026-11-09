const NAME_PUNCT = /[^\p{L}\p{N}\s]/gu;

export function normalizeName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(NAME_PUNCT, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D+/g, '');
  if (!digits) return '';
  return hasPlus ? `+${digits}` : digits;
}

export function searchDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

const reservedInstagramPaths = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'accounts',
  'direct',
  'legal',
  'about',
  'developer',
  'directory',
]);

/**
 * Canonical Instagram identity key. Username/title is never the identity.
 * Known URL variations are collapsed before comparison.
 */
export function normalizeInstagramHref(href: string): string {
  const raw = href.trim();
  if (!raw) return '';

  let url: URL;
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    const username = normalizeUsername(raw);
    return username ? `https://www.instagram.com/${username}` : '';
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  const allowed = host === 'instagram.com' || host === 'instagr.am' || host === 'ig.me';
  if (!allowed) return '';

  const segments = url.pathname
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s !== '_u' && s !== 'direct' && s !== 'm');

  const username = normalizeUsername(segments[0] ?? '');
  if (!username || reservedInstagramPaths.has(username)) return '';
  return `https://www.instagram.com/${username}`;
}

export function instagramUsernameFromHref(href: string): string {
  const normalized = normalizeInstagramHref(href);
  if (!normalized) return '';
  return normalized.replace('https://www.instagram.com/', '');
}

export function instagramProfileUrl(originalHref: string, normalizedHref: string): string {
  return originalHref.trim() || normalizedHref;
}

export function instagramDmUrl(username: string): string {
  return `https://ig.me/m/${encodeURIComponent(normalizeUsername(username))}`;
}

export function vcfFingerprint(input: {
  normalizedName: string;
  phones: Array<{ normalized: string }>;
  emails: Array<{ value: string }>;
  uid?: string;
}): string {
  const phones = [...new Set(input.phones.map((p) => p.normalized).filter(Boolean))].sort();
  const emails = [
    ...new Set(input.emails.map((e) => e.value.trim().toLowerCase()).filter(Boolean)),
  ].sort();
  const payload = [input.uid?.trim().toLowerCase() ?? '', input.normalizedName, phones.join(','), emails.join(',')].join(
    '|',
  );
  return `fp:${fnv(payload)}`;
}

function fnv(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function vcfSourceIdentifier(uid: string | undefined, fingerprint: string): string {
  const cleanUid = uid?.trim();
  if (cleanUid) return `uid:${cleanUid.toLowerCase()}`;
  return fingerprint;
}

export function phoneBelongsToContact(
  contactPhones: Array<{ value: string; normalized: string }>,
  invitedPhone: string,
): boolean {
  const wanted = normalizePhone(invitedPhone);
  return contactPhones.some((phone) => phone.normalized === wanted || phone.value === invitedPhone);
}
