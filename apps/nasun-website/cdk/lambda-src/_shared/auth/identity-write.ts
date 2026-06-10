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
  // S2.C get-user-profile self-write mirror: PATCH attribute deltas + POST create.
  profileAttributesSync: '/profile/attributes-sync',
  profileCreateMirror: '/profile/create-mirror',
  // S3.R2 wallet-api reader: box-served multi-wallet list (GET, query-param input).
  walletList: '/wallet/list',
  // S3.R3 get-user-count reader: box-served exact user_profiles count (GET, no input).
  profileCount: '/profile/count',
  // 3d step-2 prerequisite: single-provider linkedAccounts merge for the auth-{sui,solana,metamask}
  // -additional verify/label/app-binding/remove flows (sets linked_accounts.<provider> only).
  linkedAccountMerge: '/profile/linked-account-merge',
  // 3d step-2 prerequisite: auth-twitter callback Twitter-primary profile refresh (promoted
  // twitter columns + username/originalTwitterHandle/profileImageUrl/verified attributes +
  // optional xHistory append). UPDATE-only mirror of callback.ts's existing-profile branch.
  twitterPrimary: '/profile/twitter-primary',
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

  // 3d-S0 reliability soak: per-write first-try outcome signal. Emits route + ok=1|0 + latency for
  // BOTH success and failure (the old code only logged failures, so success rate was unobservable).
  // No body / identifiers are logged (route paths carry none), so this is PII-safe. Queryable via
  // CloudWatch Logs Insights to prove box-write first-try success ~100% BEFORE the authority flip
  // removes the dal-reload backstop. Purely additive: the helper still NEVER throws and is still a
  // no-op until IDENTITY_WRITE_URL/SECRET are wired.
  const startedAt = Date.now();
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
    console.log(`[identity-mirror-metric] route=${path} ok=1 ms=${Date.now() - startedAt}`);
  } catch (err) {
    console.warn(
      `[identity-mirror-metric] route=${path} ok=0 ms=${Date.now() - startedAt} err=${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * AUTHORITATIVE box write for the AWS-exit DAL 3d write-path inversion. Unlike mirrorIdentityWrite
 * (best-effort, never throws), this one THROWS after exhausting retries so a box failure surfaces to
 * the caller instead of being silently swallowed. Used once a route is added to
 * IDENTITY_WRITE_FLIP_ROUTES: the box write joins the critical path (dual-authoritative with the
 * still-present DynamoDB write), which keeps box == DynamoDB so dal-reload (DDB->box) stays a no-op
 * and the box-served readers are correct. The true SoT cede (drop DDB to best-effort + stop
 * dal-reload) is a later step.
 *
 * RETRY SAFETY: retries are safe ONLY for idempotent routes (e.g. /telegram/disconnect's
 * `UPDATE ... WHERE id=$`). The single retry rides out a transient box blip.
 *
 * BUDGET: the worst-case wall time (attempts x timeoutMs + backoff) MUST stay under the calling
 * lambda's timeout, or the lambda is timeout-KILLED (504) instead of returning a clean 500. The
 * tightest flipped lambda is link-account at 10s (and it does linking work before the box write), so
 * the default is timeoutMs=1500 + retries=1 => worst ~3.4s, which fits every flipped lambda
 * (10s/15s/30s) with margin. This is intentionally NOT a long swap-ride-out budget: the rare
 * multi-second tail seen in the 3d-S0 soak is dal-reload's schema-swap stall, which (a) is
 * backstopped by dal-reload itself during the overlap (a missed box write self-heals on the next
 * <=10min reload) and (b) DISAPPEARS at step-2 once dal-reload is stopped (box writes become
 * uniformly ~330ms, so 1500ms never clips). Callers on a lambda with more headroom may pass a larger
 * budget; step-2's profileUpsert/wallet should pass opts matched to their own lambda timeout.
 */
export async function authoritativeIdentityWrite(
  path: string,
  payload: unknown,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<void> {
  const base = process.env.IDENTITY_WRITE_URL;
  const secret = process.env.IDENTITY_WRITE_SECRET;
  // Authoritative path: a missing config is a hard error (the caller chose flip mode for this route).
  if (!base || !secret) throw new Error('authoritativeIdentityWrite: IDENTITY_WRITE_URL/SECRET unset');

  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 1500;
  const retries = Number.isInteger(opts.retries) && (opts.retries as number) >= 0 ? (opts.retries as number) : 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const startedAt = Date.now();
    try {
      const res = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`[identity-auth-write] route=${path} ok=1 attempt=${attempt} ms=${Date.now() - startedAt}`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[identity-auth-write] route=${path} ok=0 attempt=${attempt} ms=${Date.now() - startedAt} err=${err instanceof Error ? err.message : String(err)}`,
      );
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * GET a box identity READ route (e.g. /profile/by-wallet) for the S2.C get-user-profile reader
 * cutover. Co-located with mirrorIdentityWrite so the box-call surface (write + read) lives in
 * one file and is hardened in one place. No-op (returns null) unless BOTH IDENTITY_READ_URL and
 * IDENTITY_READ_SECRET are set. NEVER throws: a missing config, non-200 status (404 = profile or
 * wallet absent / box lag), timeout, or network error returns null so the caller falls back to
 * its DynamoDB read. Read-only on the box side (single SELECT), so it cannot mutate the mirror.
 */
export async function readProfileFromBox(
  path: string,
  query: Record<string, string>,
): Promise<Record<string, any> | null> {
  const base = process.env.IDENTITY_READ_URL;
  const secret = process.env.IDENTITY_READ_SECRET;
  if (!base || !secret) return null;

  const overrideMs = Number(process.env.IDENTITY_READ_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(overrideMs) && overrideMs > 0 ? overrideMs : DEFAULT_TIMEOUT_MS;

  try {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${base.replace(/\/+$/, '')}${path}?${qs}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 200) return (await res.json()) as Record<string, any>;
    return null;
  } catch (err) {
    console.warn(`[identity-read] ${path} failed (non-blocking):`, err instanceof Error ? err.message : err);
    return null;
  }
}
