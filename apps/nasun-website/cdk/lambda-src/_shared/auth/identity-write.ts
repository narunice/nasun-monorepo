/**
 * Identity mirror write client (AWS-exit DAL S1.2 grace).
 *
 * Additive dual-write to the box-co-located `nasun-identity` service. After the login/wallet
 * lambdas write DynamoDB (still the source of truth in S1), they additionally POST the same write
 * here so the box PostgreSQL mirror carries it. This is the wallet/profile analogue of
 * issuer-mint.ts: the lambda stays on AWS and calls the box over a shared bearer.
 *
 * Best-effort + non-blocking: mirrorIdentityWrite NEVER throws. A box failure is logged and
 * swallowed, because the user path already succeeded on DynamoDB and dal-reload (full re-scan) +
 * dal-reconcile are the backstop that converges any missed or skewed box write on the next cycle.
 * So the box is a FOLLOWER in S1 — not authoritative, no serving flip, no DynamoDB-write removal
 * (those are S2/S3).
 *
 * Grace toggle: active only when BOTH IDENTITY_WRITE_URL and IDENTITY_WRITE_SECRET are set. While
 * either is unset (today's default) the helper is a no-op, so deploying this code changes nothing
 * until the env is wired at cutover, and unsetting it rolls back. The bearer is a dedicated box
 * secret (`identity-bearer`), distinct from the issuer mint-secret — the issuer signing service is
 * untouched. The secret is read at call time so a warm lambda picks up the value once it is wired.
 *
 * Call it with `await` for a reliable, verifiable mirror (one box round-trip, capped by the
 * timeout); the helper never rejects, so awaiting cannot break the caller. Call it as a bare
 * statement (fire-and-forget) only if the extra latency must be avoided.
 */

const DEFAULT_TIMEOUT_MS = 4000;

export const IDENTITY_ROUTES = {
  profileUpsert: '/profile/upsert',
  walletRegister: '/wallet/register',
  walletRemove: '/wallet/remove',
  // S2.A account-linking: full resulting-state mirror of the profile rows link-account mutated.
  profileLinkSync: '/profile/link-sync',
  // S2.B telegram membership.
  telegramVerify: '/telegram/verify',
  telegramDisconnect: '/telegram/disconnect',
} as const;

/**
 * POST `payload` to a box identity route (e.g. IDENTITY_ROUTES.profileUpsert). No-op unless wired.
 * NEVER throws: a missing config, non-2xx status (status only, never the body — it carries
 * identifiers), timeout, or network error is logged and swallowed. Call AFTER the authoritative
 * DynamoDB write.
 */
export async function mirrorIdentityWrite(path: string, payload: unknown): Promise<void> {
  const base = process.env.IDENTITY_WRITE_URL;
  const secret = process.env.IDENTITY_WRITE_SECRET;
  if (!base || !secret) return;

  // Fall back to the default for unset / non-numeric / non-positive overrides so a bad config never
  // reaches AbortSignal.timeout() (which throws on negative/NaN).
  const overrideMs = Number(process.env.IDENTITY_WRITE_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(overrideMs) && overrideMs > 0 ? overrideMs : DEFAULT_TIMEOUT_MS;

  try {
    const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn(`[identity-mirror] ${path} failed (non-blocking):`, err instanceof Error ? err.message : err);
  }
}
