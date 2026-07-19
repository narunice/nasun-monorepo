// External clients for the box referral service.
//
// 1. identity-compute (box loopback :3211): profile reads (by-identity / by-twitter-id / batch) + the
//    user_profiles attributes-sync write (referralCode, lastReferralDeclinedAt). SAME contract the referral
//    lambda used via _shared/auth/identity-write.ts, so the byte-parity is inherited. user_profiles stays
//    single-writer through nasun-identity (the referral service NEVER writes user_profiles directly).
// 2. box explorer-api (HTTP, x-api-key): referral-eligibility-signals + referral-stats (reads) + onboarding-
//    bonus (admin approve/reverse backfill). These already compute on the box explorer-api PG.

import { IDENTITY, identitySecret, EXPLORER } from './config';
import type { EligibilitySignals } from './eligibility';

// ---- identity-compute (loopback) -----------------------------------------------------------------

// GET a profile read route. Returns the parsed body on 200, else null. NEVER throws (parity with the lambda
// readProfileFromBox: a box MISS/error falls back to a fail-closed default at the call site).
export async function readProfile(
  path: string,
  query: Record<string, string>,
): Promise<Record<string, any> | null> {
  try {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${IDENTITY.baseUrl}${path}?${qs}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${identitySecret()}` },
      signal: AbortSignal.timeout(IDENTITY.timeoutMs),
    });
    if (res.status === 200) return (await res.json()) as Record<string, any>;
    return null;
  } catch (err) {
    console.warn(`[referral] identity ${path} read failed (non-blocking):`, err instanceof Error ? err.message : err);
    return null;
  }
}

export function readProfileByIdentity(identityId: string) {
  return readProfile('/profile/by-identity', { identityId });
}

// Status-aware profile read. Same call as readProfile but surfaces the upstream
// HTTP status so callers can tell a genuine 404 (profile absent) apart from an
// outage (5xx / timeout / network error, reported as status 0). NEVER throws.
//   - { status: 200, body }  profile found
//   - { status: 404, body: null }  profile genuinely absent (identity has no row)
//   - { status: 0,   body: null }  outage: fetch threw or timed out
//   - { status: <other>, body: null }  any other non-200 (treated as outage by callers)
export async function readProfileByIdentityDetailed(
  identityId: string,
): Promise<{ status: number; body: Record<string, any> | null }> {
  try {
    const qs = new URLSearchParams({ identityId }).toString();
    const res = await fetch(`${IDENTITY.baseUrl}/profile/by-identity?${qs}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${identitySecret()}` },
      signal: AbortSignal.timeout(IDENTITY.timeoutMs),
    });
    if (res.status === 200) {
      return { status: 200, body: (await res.json()) as Record<string, any> };
    }
    return { status: res.status, body: null };
  } catch (err) {
    console.warn('[referral] identity /profile/by-identity read failed (non-blocking):', err instanceof Error ? err.message : err);
    return { status: 0, body: null };
  }
}

// Returns { matches: [{ identityId, walletAddress, username, customDisplayName }] } | null.
export function readProfilesByTwitterId(twitterId: string) {
  return readProfile('/profile/by-twitter-id', { twitterId });
}

// POST /profile/batch { identityIds } -> { profiles: { id: item } }. Returns {} on any failure (parity with
// the lambda BatchGet enrich: a failure degrades twitterLinked to false rather than erroring the request).
export async function profileBatch(identityIds: string[]): Promise<Record<string, Record<string, any>>> {
  if (identityIds.length === 0) return {};
  try {
    const res = await fetch(`${IDENTITY.baseUrl}/profile/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${identitySecret()}` },
      body: JSON.stringify({ identityIds }),
      signal: AbortSignal.timeout(IDENTITY.timeoutMs),
    });
    if (res.status !== 200) return {};
    const body = (await res.json()) as { profiles?: Record<string, Record<string, any>> };
    return body.profiles || {};
  } catch (err) {
    console.warn('[referral] identity batch failed (non-blocking):', err instanceof Error ? err.message : err);
    return {};
  }
}

// POST /profile/attributes-sync (AUTHORITATIVE for the my-code referralCode write: the code is already
// reserved in referral_codes, so a failure here must surface as a 500, mirroring the lambda's
// authoritativeIdentityWrite flip path). One retry, then throws.
export async function attributesSyncAuthoritative(identityId: string, set: Record<string, string>): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const res = await fetch(`${IDENTITY.baseUrl}/profile/attributes-sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${identitySecret()}` },
        body: JSON.stringify({ identityId, set }),
        signal: AbortSignal.timeout(IDENTITY.timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 1) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// POST /profile/attributes-sync (BEST-EFFORT for the admin decline cooldown tombstone: the decline status is
// already committed, so a tombstone failure must not fail the decline -- logged + swallowed, mirroring the
// lambda's best-effort mirrorIdentityWrite for lastReferralDeclinedAt).
export async function attributesSyncBestEffort(identityId: string, set: Record<string, string>): Promise<void> {
  try {
    const res = await fetch(`${IDENTITY.baseUrl}/profile/attributes-sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${identitySecret()}` },
      body: JSON.stringify({ identityId, set }),
      signal: AbortSignal.timeout(IDENTITY.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.warn('[referral] attributes-sync best-effort failed:', err instanceof Error ? err.message : err);
  }
}

// ---- box explorer-api (HTTP, x-api-key) ----------------------------------------------------------

// Eligibility signals for the my-code gate. Parity with the lambda fetchEligibilitySignals: 5s timeout,
// 1 retry, 503 -> pending, !ok (after retry) -> outage, !activationsCacheReady -> pending.
export async function fetchEligibilitySignals(
  identityId: string,
): Promise<EligibilitySignals | { error: 'pending' } | { error: 'outage' }> {
  if (!EXPLORER.statsKey) {
    console.error('[referral] Eligibility API key not configured');
    return { error: 'outage' };
  }
  const url = `${EXPLORER.apiUrl}/api/v1/points/referral-eligibility-signals/${encodeURIComponent(identityId)}`;
  const headers = { 'x-api-key': EXPLORER.statsKey };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(EXPLORER.timeoutMs) });
      if (res.status === 503) return { error: 'pending' };
      if (!res.ok) {
        if (attempt === 1) return { error: 'outage' };
        continue;
      }
      const data = (await res.json()) as EligibilitySignals;
      if (!data.activationsCacheReady) return { error: 'pending' };
      return data;
    } catch (err) {
      if (attempt === 1) {
        console.warn('[referral] Eligibility fetch failed:', err instanceof Error ? err.message : err);
        return { error: 'outage' };
      }
    }
  }
  return { error: 'outage' };
}

// Referral bonus stats for my-stats (totalBonusPoints). Parity with the lambda: 5s timeout, null on failure.
export async function fetchReferralStats(identityId: string): Promise<{ totalBonusPoints: number } | null> {
  if (!EXPLORER.statsKey) return null;
  try {
    const headers = { 'x-api-key': EXPLORER.statsKey };
    const res = await fetch(
      `${EXPLORER.apiUrl}/api/v1/points/referral-stats?referrer=${encodeURIComponent(identityId)}`,
      { headers, signal: AbortSignal.timeout(EXPLORER.timeoutMs) },
    );
    if (res.ok) return (await res.json()) as { totalBonusPoints: number };
    return null;
  } catch (err) {
    console.warn('[referral] Failed to fetch bonus stats:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Onboarding-bonus grant (admin approve / appeal-reverse backfill). Parity with the lambda
// grantIfReferralActivated GRANT path: the caller pre-knows the referral is ACTIVATED (it just set it), so we
// POST onboarding-bonus WITHOUT requireReferralActivated. Validates the per-kind externalId regex first.
// Best-effort: never throws (admin response must not fail on a backfill error).
export type OnboardingKind = 'follow-nasun' | 'x-link' | 'google-link' | 'telegram-link';
const ONBOARDING_EXTERNAL_ID_REGEX: Record<OnboardingKind, RegExp> = {
  'follow-nasun': /^\d{1,25}$/,
  'x-link': /^\d{1,25}$/,
  'google-link': /^[\w-]+:[\w-]{36}$/,
  'telegram-link': /^\d{1,25}$/,
};

export async function grantOnboardingBonus(
  kind: OnboardingKind,
  externalId: string,
  identityId: string,
  walletAddress: string | null,
): Promise<void> {
  if (!EXPLORER.onboardingKey) return; // distinct ONBOARDING_BONUS_API_KEY (NOT the stats key)
  if (!ONBOARDING_EXTERNAL_ID_REGEX[kind].test(externalId)) return;
  try {
    await fetch(`${EXPLORER.apiUrl}/api/v1/points/onboarding-bonus`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': EXPLORER.onboardingKey },
      body: JSON.stringify({ identityId, walletAddress: walletAddress ?? undefined, kind, externalId }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.warn(`[referral] onboarding-bonus ${kind} failed (non-fatal):`, err instanceof Error ? err.message : err);
  }
}
