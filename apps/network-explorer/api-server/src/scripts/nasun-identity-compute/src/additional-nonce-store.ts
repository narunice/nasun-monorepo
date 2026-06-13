// In-memory nonce store for the C4-1 additional-wallet flows (sui/solana/metamask). Replaces the
// lambda's DynamoDB MetaMaskAuthNonces table (nonceStore.ts). The compute service is a SINGLE loopback
// process, so a module-scope Map is correct + single-use: consume() deletes before returning, so a
// replay (or two concurrent verifies of the same nonce) finds nothing -- the same forgery-block the
// lambda gets from DeleteItem ReturnValues=ALL_OLD.
//
// Unlike the C3a login nonce ({message, expiresAt}), the additional record carries the full challenge
// binding (identityId + walletAddress + appId + message) so verify can enforce identity-match and
// recover against the exact challenged address. Keys are namespaced by chain prefix
// (`sui_additional:` / `solana_additional:` / `additional:`) so the three chains never collide.

export const NONCE_TTL_SECONDS = 300;

export interface AdditionalNonceRecord {
  provider: string; // chain that minted this nonce -- asserted at consume time (review #4: defense in
  // depth beyond the key prefix, so a future chain can never consume another chain's nonce by content).
  identityId: string;
  walletAddress: string;
  appId?: string;
  message: string;
  expiresAt: number; // unix seconds
}

const store = new Map<string, AdditionalNonceRecord>();

// Opportunistic sweep of expired entries on each put, so a process that issues many never-consumed
// challenges does not leak memory. O(n) but n is tiny (nonces live <=5 min); cheap vs a timer.
function sweep(nowSec: number): void {
  for (const [k, v] of store) {
    if (v.expiresAt < nowSec) store.delete(k);
  }
}

export function putAdditionalNonce(key: string, record: AdditionalNonceRecord): void {
  sweep(Math.floor(Date.now() / 1000));
  store.set(key, record);
}

/** Atomic get+delete: returns the record once, then it is gone (replay-safe, single-use). */
export function consumeAdditionalNonce(key: string): AdditionalNonceRecord | null {
  const rec = store.get(key);
  if (!rec) return null;
  store.delete(key);
  return rec;
}
