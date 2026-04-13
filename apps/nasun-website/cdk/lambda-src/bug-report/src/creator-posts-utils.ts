/**
 * Pure helpers for Creator Posts handlers.
 * Extracted for unit testing (no AWS SDK dependencies).
 */

export const TWEET_URL_RE =
  /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;
export const HANDLE_RE = /^[a-z0-9_]{1,15}$/;
export const IMAGE_HOST_ALLOWLIST = new Set(['pbs.twimg.com', 'abs.twimg.com']);

export interface ParsedTweet {
  postId: string;
  handle: string;
  canonicalUrl: string;
}

/**
 * Extract tweet ID + handle from a URL. Canonicalizes host to x.com and strips
 * query/hash. Returns null for any unsupported input.
 */
export function parseTweetUrl(input: unknown): ParsedTweet | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  const m = TWEET_URL_RE.exec(trimmed);
  if (!m) return null;
  const handle = m[1].toLowerCase();
  const postId = m[2];
  // postId is already constrained to \d{5,25}. Guard against leading zeros?
  // Tweet IDs are Snowflake IDs (no leading zero). Reject to avoid duplicate
  // ambiguity if someone pads.
  if (postId.startsWith('0')) return null;
  return {
    postId,
    handle,
    canonicalUrl: `https://x.com/${handle}/status/${postId}`,
  };
}

export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const stripped = raw.replace(/^@/, '').toLowerCase();
  return HANDLE_RE.test(stripped) ? stripped : null;
}

export function safeImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!IMAGE_HOST_ALLOWLIST.has(u.host)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** UTC midnight of the current day as ISO-8601 string. */
export function startOfUtcTodayIso(nowMs: number = Date.now()): string {
  const midnight = Math.floor(nowMs / 86400000) * 86400000;
  return new Date(midnight).toISOString();
}

export function utcNextMidnightIso(nowMs: number = Date.now()): string {
  const next = (Math.floor(nowMs / 86400000) + 1) * 86400000;
  return new Date(next).toISOString();
}

export function encodeCursor(
  key: Record<string, unknown> | undefined,
): string | undefined {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(
  cursor: string | undefined,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Verifies the URL handle matches the submitter's X handle (case-insensitive).
 * Both sides must pass HANDLE_RE (after lowercasing / `@` stripping).
 */
export function handlesMatch(urlHandle: unknown, myHandle: unknown): boolean {
  if (typeof urlHandle !== 'string' || typeof myHandle !== 'string') return false;
  const urlLower = urlHandle.toLowerCase();
  const myLower = myHandle.replace(/^@/, '').toLowerCase();
  if (!HANDLE_RE.test(urlLower) || !HANDLE_RE.test(myLower)) return false;
  return urlLower === myLower;
}
