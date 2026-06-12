// In-memory nonce store for C3a login (replaces the DynamoDB SuiAuthNonces / MetaMaskAuthNonces
// tables). The box compute is a SINGLE loopback Node process, so prepare (insert) and connect-verify
// (consume = atomic get+delete) share one Map -- single-use, race-safe within one process, 5-min TTL.
//
// Why no PG / DynamoDB: nonces are ephemeral, single-use, 5-min auth state, NOT identity SoT. Keeping
// them in-process avoids a box DDL/role change and is reconcile-neutral. Trade-offs (acceptable):
//   - a process restart drops pending nonces -> the user re-initiates login (5-min window).
//   - prepare and connect-verify MUST hit the same backend; at cutover, repoint the prepare + verify
//     API Gateway routes for a chain TOGETHER. A flow prepared on the lambda then verifying on the box
//     finds no nonce -> one 400 -> retry. Standard per-route cutover transient.
// This service MUST stay single-process (it is: loopback, not horizontally scaled).

export interface NonceRecord {
  message: string;
  expiresAt: number; // unix SECONDS (parity with the lambda nonce schema)
}

const store = new Map<string, NonceRecord>();

// Periodic sweep so expired-but-unconsumed nonces do not accumulate. unref() so the timer never keeps
// the process alive. The consume path also re-checks expiry, so the sweep is purely housekeeping.
const SWEEP_INTERVAL_MS = 60_000;
const sweeper = setInterval(() => {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [key, rec] of store) {
    if (nowSec > rec.expiresAt) store.delete(key);
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref?.();

/** Store a freshly minted nonce under a chain-namespaced key (e.g. "suiPrepare:{nonce}"). */
export function putNonce(key: string, record: NonceRecord): void {
  store.set(key, record);
}

/**
 * Atomic get+delete. Returns the record only to the FIRST caller (delete-on-read blocks replay), or
 * null if the key was never stored or already consumed. Expiry is the caller's responsibility (it maps
 * the parity error message), matching the lambda which deletes first then checks expiresAt.
 *
 * ★ SECURITY INVARIANT: the get -> delete sequence below MUST stay synchronous (no `await` between
 * them). Node is single-threaded, so with no async boundary two concurrent verifies cannot both read
 * the same record before it is deleted (single-use is preserved). Inserting any `await` between
 * `store.get` and `store.delete` would re-open a double-consume race -- do NOT.
 */
export function consumeNonce(key: string): NonceRecord | null {
  const rec = store.get(key);
  if (!rec) return null;
  store.delete(key);
  return rec;
}
