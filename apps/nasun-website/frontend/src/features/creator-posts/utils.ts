import { IMAGE_HOST_ALLOWLIST, HANDLE_RE } from './types';

export function safeImageUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!IMAGE_HOST_ALLOWLIST.includes(u.host)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function isSafeHandle(raw: unknown): raw is string {
  return typeof raw === 'string' && HANDLE_RE.test(raw);
}

export function openPostUrlSafely(postUrl: string): void {
  try {
    const u = new URL(postUrl);
    if (u.protocol !== 'https:') return;
    if (!['x.com', 'twitter.com'].includes(u.host)) return;
    window.open(u.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

const TWEET_URL_RE =
  /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/;

export function isLikelyTweetUrl(raw: string): boolean {
  return TWEET_URL_RE.test(raw.trim());
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}
