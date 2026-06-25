// In-memory OAuth session store for the Twitter de-Lambda login (replaces the DynamoDB
// TwitterOAuthSessions table). The box compute is a SINGLE loopback Node process, so the login
// (insert) and callback (consume = atomic get+delete) share one Map -- single-use, race-safe within
// one process, 15-min TTL (parity with the lambda SessionManager ttlMinutes=15).
//
// Why no PG / DynamoDB: an OAuth session is ephemeral, single-use, short-lived CSRF/PKCE state, NOT
// identity SoT. Keeping it in-process avoids a box DDL/role change and is reconcile-neutral. The same
// trade-offs as nonce-store.ts apply:
//   - a process restart drops pending sessions -> the in-flight login fails closed (the callback finds
//     no session -> 400) and the user re-initiates OAuth. The login->callback window is the time the user
//     spends on X's authorize page (seconds to a couple of minutes), so a restart mid-flow is rare.
//   - login (createSession) and callback (consume) MUST hit the same backend; at cutover, repoint the
//     /auth/twitter/login + /auth/twitter/callback routes TOGETHER. A login prepared on the lambda then
//     a callback on the box finds no session -> one 400 -> retry. Standard per-route cutover transient.
// This service MUST stay single-process (it is: loopback, not horizontally scaled).

export interface TwitterSessionRecord {
  codeVerifier: string;
  state: string; // the RANDOM state (CSRF), NOT the composite "state.sessionId" sent to X
  redirectUri: string;
  expiresAt: number; // unix SECONDS (parity with the lambda session schema)
}

const store = new Map<string, TwitterSessionRecord>();

// Periodic sweep so expired-but-unconsumed sessions do not accumulate. unref() so the timer never keeps
// the process alive. The consume path also re-checks expiry, so the sweep is purely housekeeping.
const SWEEP_INTERVAL_MS = 60_000;
const sweeper = setInterval(() => {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const [key, rec] of store) {
    if (nowSec > rec.expiresAt) store.delete(key);
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref?.();

/** Store a freshly created OAuth session keyed by sessionId. */
export function putSession(sessionId: string, record: TwitterSessionRecord): void {
  store.set(sessionId, record);
}

/**
 * Atomic get+delete (parity with the lambda's getAndDeleteSession DeleteItem ReturnValues:ALL_OLD).
 * Returns the record only to the FIRST caller (delete-on-read blocks OAuth replay), or null if the key
 * was never stored or already consumed. Expiry is the caller's responsibility (it maps the parity error),
 * matching the lambda which deletes first then checks expiresAt.
 *
 * ★ SECURITY INVARIANT: the get -> delete sequence below MUST stay synchronous (no `await` between them).
 * Node is single-threaded, so with no async boundary two concurrent callbacks cannot both read the same
 * record before it is deleted (single-use is preserved). Inserting any `await` between `store.get` and
 * `store.delete` would re-open a double-consume race -- do NOT.
 */
export function consumeSession(sessionId: string): TwitterSessionRecord | null {
  const rec = store.get(sessionId);
  if (!rec) return null;
  store.delete(sessionId);
  return rec;
}
