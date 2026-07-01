/**
 * zkLogin stale-session recovery
 *
 * Centralised detection + recovery for the case where a cached zkLogin proof is
 * rejected on-chain at EXECUTION time (not at signing time).
 *
 * Symptom: the client signs a transaction successfully (the epoch guard in
 * signWithZkLogin passes) but the validator rejects the zkLogin signature with
 * "Groth16 proof verify failed" / "Invalid user signature". This happens when a
 * cached proof no longer verifies against the live chain: a fresh-genesis epoch
 * reset that left maxEpoch inside the guard window, or a Google JWK that rotated
 * mid-session. Either way the cached session is dead and only a fresh OAuth
 * login mints a proof that verifies again.
 *
 * Recovery is intentionally minimal: clear the dead session so every app's auth
 * gate prompts a fresh login. We do NOT force a page reload -- a reload throws
 * the user out of whatever they were doing, and stale JS bundles are already
 * handled by the VitePWA self-destroying service worker and the
 * vite:preloadError reload guard. A fresh login (with a valid prover proof) is
 * all that is needed.
 *
 * The error surfaces at every executeTransactionBlock call site (40+ across
 * pado + nasun-website + gostop), so recovery is wired once at the shared
 * chokepoint (getSuiClient, see sui/client.ts) rather than per call site. This
 * module is a LEAF: it imports nothing from core/zklogin or sui/client, so
 * wrapping the client here cannot create an import cycle.
 */

import type { SuiClient } from '@mysten/sui/client';
import { ZkLoginError } from '../types/zklogin';

/** Extract a searchable string from an arbitrary thrown value (incl. nested cause). */
function extractMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause;
    return cause ? `${err.message} ${extractMessage(cause)}` : err.message;
  }
  if (typeof err === 'object') {
    const maybe = err as { message?: unknown };
    if (typeof maybe.message === 'string') return maybe.message;
    try {
      return JSON.stringify(err);
    } catch {
      return '';
    }
  }
  return String(err);
}

/**
 * Whether a thrown execution error indicates a zkLogin proof that no longer
 * verifies on-chain (the session is dead and only re-auth recovers it).
 *
 * Anchored on "groth16", which the validator emits ONLY for zkLogin proof
 * verification, so it never false-positives on ed25519/passkey signatures or
 * ordinary Move aborts. A secondary guarded match covers other zkLogin-specific
 * signature rejections.
 */
export function isStaleZkLoginProofError(err: unknown): boolean {
  const msg = extractMessage(err).toLowerCase();
  if (!msg) return false;
  if (msg.includes('groth16')) return true;
  if (
    msg.includes('zklogin') &&
    (msg.includes('proof') || msg.includes('verify') || msg.includes('signature'))
  ) {
    return true;
  }
  return false;
}

type StaleSessionHandler = () => void;

// A Set (not a single slot) so multiple mounted useZkLogin instances each
// register without clobbering one another; unmount removes only that instance's
// handler. Handlers are idempotent logout calls, so invoking all of them once is
// safe.
const handlers = new Set<StaleSessionHandler>();

/**
 * Register a recovery handler (e.g. useZkLogin's logout). Returns an unregister
 * function for cleanup on unmount.
 */
export function registerZkLoginStaleSessionHandler(handler: StaleSessionHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** Invoke all registered recovery handlers. A throw in one never blocks the rest. */
export function notifyZkLoginStaleSession(): void {
  for (const handler of handlers) {
    try {
      handler();
    } catch {
      // A failing logout handler must not mask the original transaction error.
    }
  }
}

/**
 * Recovery for a zkLogin proof rejected on-chain at execution time: clear the
 * dead session (via the registered logout handlers) so the auth gate forces a
 * fresh OAuth login instead of repeatedly re-signing with a stranded proof.
 */
export function handleStaleZkLoginProof(): void {
  notifyZkLoginStaleSession();
}

/**
 * Wrap a SuiClient's executeTransactionBlock so a zkLogin proof the validator
 * rejects at execution time (a session stranded by a fresh-genesis epoch reset
 * or a rotated JWK) clears the dead session and surfaces a friendly "log in
 * again" error instead of the raw "Groth16 proof verify failed".
 *
 * Apply this to EVERY SuiClient that signs zkLogin transactions. zkLogin builds
 * its signature externally and always submits via executeTransactionBlock;
 * keypair/passkey go through signAndExecuteTransaction and never reach Groth16
 * verification, so they are unaffected. Each app caches its own client (the
 * @nasun/wallet singleton, pado's lib/sui-client, etc.), so each must call this
 * on its own instance. Idempotent only in effect, not structurally: do not
 * double-wrap the same instance.
 */
export function installZkLoginRecovery(client: SuiClient): void {
  type ExecuteFn = SuiClient['executeTransactionBlock'];
  const execute: ExecuteFn = client.executeTransactionBlock.bind(client);
  (client as { executeTransactionBlock: ExecuteFn }).executeTransactionBlock = async (input) => {
    try {
      return await execute(input);
    } catch (err) {
      if (isStaleZkLoginProofError(err)) {
        handleStaleZkLoginProof();
        const recovered = new ZkLoginError(
          'SESSION_EXPIRED',
          'Your login session is no longer valid. Please log in again.',
        );
        (recovered as { cause?: unknown }).cause = err;
        throw recovered;
      }
      throw err;
    }
  };
}
