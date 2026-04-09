// HTML entity encoding to prevent stored XSS (from Pado chat-server/store.ts)
export function sanitizeContent(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/`/g, '&#96;');
}

// Strip C0/C1 control characters, zero-width characters, bidi overrides
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\uFEFF]/g;

export function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHARS, '');
}

// Reserved message prefixes that users must not send
const RESERVED_PREFIXES = ['[SYSTEM]', '[BOT]'];

export function hasReservedPrefix(text: string): boolean {
  const upper = text.trimStart().toUpperCase();
  return RESERVED_PREFIXES.some((p) => upper.startsWith(p));
}
