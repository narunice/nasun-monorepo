/**
 * Pure helpers for Creator Posts handlers.
 * Extracted for unit testing (no AWS SDK dependencies).
 */

export const TWEET_URL_RE =
  /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;
// Shortlink forms emitted by X's mobile share sheet. The path segment "i" is
// a placeholder, not the author handle, so the author must be resolved via
// a secondary lookup (X oEmbed) before the handle-match check can run.
export const TWEET_SHORTLINK_RE =
  /^https:\/\/(?:x|twitter)\.com\/i(?:\/web)?\/status\/(\d{5,25})(?:[/?#].*)?$/;
export const HANDLE_RE = /^[a-z0-9_]{1,15}$/;
export const IMAGE_HOST_ALLOWLIST = new Set(['pbs.twimg.com', 'abs.twimg.com']);

export interface ParsedTweet {
  postId: string;
  // null for shortlink URLs (e.g. x.com/i/status/...) where the author handle
  // is not present in the URL and must be resolved out-of-band.
  handle: string | null;
  // Canonical URL is only known once the handle is; null for shortlinks.
  canonicalUrl: string | null;
}

/**
 * Extract tweet ID + handle from a URL. Canonicalizes host to x.com and strips
 * query/hash. Accepts both the full form (x.com/{handle}/status/{id}) and the
 * shortlink form (x.com/i[/web]/status/{id}). Returns null for unsupported
 * inputs.
 */
export function parseTweetUrl(input: unknown): ParsedTweet | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Shortlink check first: TWEET_URL_RE's handle group would otherwise match
  // the literal "i" path segment and emit a bogus handle.
  const short = TWEET_SHORTLINK_RE.exec(trimmed);
  if (short) {
    const postId = short[1];
    if (postId.startsWith('0')) return null;
    return { postId, handle: null, canonicalUrl: null };
  }

  const full = TWEET_URL_RE.exec(trimmed);
  if (full) {
    const handle = full[1].toLowerCase();
    const postId = full[2];
    if (postId.startsWith('0')) return null;
    return {
      postId,
      handle,
      canonicalUrl: `https://x.com/${handle}/status/${postId}`,
    };
  }

  return null;
}

/**
 * Resolve a tweet's author handle from its postId using X's public oEmbed
 * endpoint. No authentication required. Returns a normalized lowercase handle
 * on success, or null if the tweet is missing/protected/deleted or the
 * request fails. Bounded by a short timeout.
 *
 * Example response:
 *   { "author_url": "https://twitter.com/hyonggoo93", ... }
 */
export async function resolveTweetAuthor(
  postId: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<string | null> {
  if (!/^\d{5,25}$/.test(postId) || postId.startsWith('0')) return null;
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return null;
  const timeoutMs = opts?.timeoutMs ?? 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const tweetUrl = `https://twitter.com/i/status/${postId}`;
    const oembed = `https://publish.twitter.com/oembed?omit_script=1&url=${encodeURIComponent(tweetUrl)}`;
    const res = await fetchImpl(oembed, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { author_url?: unknown };
    if (typeof data.author_url !== 'string') return null;
    const m = /^https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(?:[/?#].*)?$/.exec(
      data.author_url,
    );
    if (!m) return null;
    const handle = m[1].toLowerCase();
    return HANDLE_RE.test(handle) ? handle : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
