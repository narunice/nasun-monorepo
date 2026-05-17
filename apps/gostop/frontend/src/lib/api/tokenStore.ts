/**
 * Gostop API JWT token store.
 *
 * Storage: sessionStorage. Per backend `AUTH_BIND_IP=true`, tokens are bound to
 * the issuing IP — closing the browser or switching networks invalidates the
 * token anyway, so persisting across sessions has no benefit and slightly
 * widens the exfiltration window. sessionStorage clears on tab close.
 *
 * Tokens are keyed by wallet address so multi-account dev flows do not leak
 * across identities. On wallet switch we read by the new address; an absent
 * key triggers a fresh challenge/verify cycle.
 */

const STORAGE_PREFIX = 'gostop:auth:';

export interface StoredToken {
  token: string;
  // Server returns `expires_in` seconds; we store an absolute deadline so a
  // long-lived tab can detect expiry without re-asking the server.
  expiresAtMs: number;
}

function keyFor(walletAddress: string): string {
  return `${STORAGE_PREFIX}${walletAddress.toLowerCase()}`;
}

export function getToken(walletAddress: string): StoredToken | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(keyFor(walletAddress));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredToken;
    if (typeof parsed.token !== 'string' || typeof parsed.expiresAtMs !== 'number') return null;
    if (Date.now() >= parsed.expiresAtMs) {
      sessionStorage.removeItem(keyFor(walletAddress));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setToken(walletAddress: string, token: string, expiresInSec: number): void {
  if (typeof sessionStorage === 'undefined') return;
  const stored: StoredToken = {
    token,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  sessionStorage.setItem(keyFor(walletAddress), JSON.stringify(stored));
}

export function clearToken(walletAddress: string): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(keyFor(walletAddress));
}

export function clearAllTokens(): void {
  if (typeof sessionStorage === 'undefined') return;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
  }
  keys.forEach((k) => sessionStorage.removeItem(k));
}
