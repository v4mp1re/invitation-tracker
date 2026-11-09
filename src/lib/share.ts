import { dataUrlToPngBlob } from './image.ts';

export function csvEscape(value: string | undefined): string {
  const text = value ?? '';
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function downloadBlob(filename: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function copyInvitation(text: string, image?: Blob | string): Promise<boolean> {
  if (image && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const png = typeof image === 'string' ? await dataUrlToPngBlob(image) : image;
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': Promise.resolve(new Blob([text], { type: 'text/plain' })),
          'image/png': Promise.resolve(png),
        }),
      ]);
      return true;
    } catch {
      /* fall through to text */
    }
  }
  return copyText(text);
}

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareText(title: string, text: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canWebShare()) return 'unsupported';
  try {
    await navigator.share({ title, text });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export function smsLink(phone: string, body: string): string {
  const number = phone.replace(/[^\d+]/g, '');
  const encoded = encodeURIComponent(body);
  return `sms:${number}?&body=${encoded}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}`;
}
