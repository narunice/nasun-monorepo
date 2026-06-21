// User-facing referral routes (the 5 JWT-authorized lambda routes), byte-parity port of
// referral/handler/src/index.ts onto box PG (referrals/referral_codes) + identity-compute profile reads +
// box explorer-api eligibility/stats. Each function returns { status, body }; the server applies CORS + JSON.
//
// Profile access (self-ref / cooldown / twitter-reuse / referee enrich) goes through identity-compute, the
// SAME contract the lambda used (readProfileFromBox / by-twitter-id / batch) -- byte-parity inherited.
// A profile-read failure is treated FAIL-CLOSED (can never loosen an anti-Sybil guard), exactly as the lambda.

import { randomBytes } from 'node:crypto';
import {
  getCodeByCode,
  getReferralByReferred,
  listReferralsByReferrer,
  countReferralsByReferrer,
  type ReferralItem,
} from './db';
import { insertCode, insertReferral, updateAppeal } from './write-db';
import {
  readProfileByIdentity,
  readProfilesByTwitterId,
  profileBatch,
  attributesSyncAuthoritative,
  fetchEligibilitySignals,
  fetchReferralStats,
} from './clients';
import { evaluateGate } from './eligibility';
import { REFERRAL_GATE_ENABLED } from './config';

export interface Result {
  status: number;
  body: Record<string, unknown>;
}

const MAX_REFERRALS_PER_USER = 100;
const CODE_GENERATION_MAX_RETRIES = 3;
const DECLINE_COOLDOWN_DAYS = 30;
const REFEREES_INLINE_PAGE_SIZE = 20;
const REFEREES_MAX_PAGE_SIZE = 100;

// --- shared utilities (byte-copy of handler/index.ts) ---

function collectLinkedIdentityIds(identityId: string, profile?: Record<string, any>): string[] {
  const ids = new Set<string>([identityId]);
  if (!profile) return [...ids];
  if (profile.linkedToPrimaryId) ids.add(profile.linkedToPrimaryId);
  if (profile.linkedAccounts) {
    for (const account of Object.values(profile.linkedAccounts) as any[]) {
      if (account?.identityId) ids.add(account.identityId);
    }
  }
  return [...ids];
}

function generateReferralCode(): string {
  return randomBytes(5).readUIntBE(0, 5).toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
}

function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ v: 1, offset })).toString('base64');
}

function decodeOffsetCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    if (parsed?.v !== 1 || typeof parsed.offset !== 'number') return null;
    if (parsed.offset < 0 || !Number.isInteger(parsed.offset)) return null;
    return parsed.offset;
  } catch {
    return null;
  }
}

interface RefereeRow {
  serial: number;
  twitterLinked: boolean;
  status: string;
  appliedAt: string;
  activatedAt: string | null;
}

// Enrich raw referral rows with twitterLinked from identity-compute /profile/batch (parity with the lambda
// BatchGet of twitterId). A batch failure degrades twitterLinked to false (does not error the request).
async function enrichReferees(rawItems: Array<ReferralItem & { _serial: number }>): Promise<RefereeRow[]> {
  if (rawItems.length === 0) return [];
  const ids = [...new Set(rawItems.map((r) => r.referredIdentityId).filter(Boolean))];
  const profiles = await profileBatch(ids);
  const linkedSet = new Set<string>();
  for (const [id, p] of Object.entries(profiles)) {
    if (p && p.twitterId) linkedSet.add(id);
  }
  return rawItems.map((item) => ({
    serial: item._serial,
    twitterLinked: linkedSet.has(item.referredIdentityId),
    status: item.status,
    appliedAt: (item.appliedAt as string) || '',
    activatedAt: (item.activatedAt as string) || null,
  }));
}

// ==================== GET /referral/my-code ====================

export async function handleMyCode(identityId: string): Promise<Result> {
  // The caller is authenticated, so a user_profiles row exists. identity-compute is the box SoT for the
  // profile (referralCode + the gate's social fields). A null read = identity outage (not "absent"): we
  // FAIL-CLOSED with 500 rather than risk a double-issue or a gate evaluated on a missing profile.
  const profile = await readProfileByIdentity(identityId);
  if (!profile) {
    return { status: 500, body: { error: 'PROFILE_UNAVAILABLE', message: 'Could not load profile. Please try again.' } };
  }
  if (profile.referralCode) {
    return { status: 200, body: { referralCode: profile.referralCode } };
  }

  if (REFERRAL_GATE_ENABLED) {
    const signals = await fetchEligibilitySignals(identityId);
    if ('error' in signals) {
      if (signals.error === 'pending') {
        return { status: 503, body: { error: 'ELIGIBILITY_PENDING', message: 'Eligibility check is warming up. Please retry shortly.' } };
      }
      return { status: 500, body: { error: 'ELIGIBILITY_UNAVAILABLE', message: 'Eligibility service temporarily unavailable. Please try again later.' } };
    }
    const decision = evaluateGate(profile, signals);
    if (!decision.eligible) {
      return {
        status: 403,
        body: {
          error: 'NOT_ELIGIBLE',
          message: 'You do not yet qualify for a referral code. See the eligibility criteria.',
          closestPath: decision.closestPath,
          hint: decision.hint,
          adminCuratedBonusTotal: signals.adminCuratedBonusTotal,
        },
      };
    }
  }

  for (let attempt = 0; attempt < CODE_GENERATION_MAX_RETRIES; attempt++) {
    const code = generateReferralCode();
    const reserved = await insertCode(code, identityId, new Date().toISOString());
    if (!reserved) continue; // collision -> retry
    // Code reserved in referral_codes. Now write referralCode to user_profiles via identity-compute
    // (AUTHORITATIVE: a failure throws -> 500; the code stays reserved, attributes-sync is idempotent on retry).
    await attributesSyncAuthoritative(identityId, { referralCode: code });
    return { status: 200, body: { referralCode: code } };
  }
  return { status: 500, body: { error: 'GENERATION_FAILED', message: 'Failed to generate referral code' } };
}

// ==================== POST /referral/apply ====================

export async function handleApply(identityId: string, rawBody: string | null): Promise<Result> {
  let referralCode: string;
  try {
    const parsed = JSON.parse(rawBody || '{}');
    referralCode = (parsed.referralCode || '').trim().toUpperCase();
  } catch {
    return { status: 400, body: { error: 'INVALID_BODY', message: 'Invalid request body' } };
  }
  if (!referralCode || (referralCode.length !== 6 && referralCode.length !== 8)) {
    return { status: 400, body: { error: 'INVALID_CODE', message: 'Invalid referral code format' } };
  }

  const codeItem = await getCodeByCode(referralCode);
  if (!codeItem) {
    return { status: 404, body: { error: 'CODE_NOT_FOUND', message: 'Invalid referral code' } };
  }
  const referrerIdentityId = codeItem.identityId;

  // Caller profile drives ALL of the anti-Sybil guards below (linked self-ref, decline cooldown, twitter
  // reuse). FAIL-CLOSED on a null read: the caller is authenticated, so their profile exists in the box
  // mirror; a null is an identity-compute outage, NOT "absent". Proceeding would silently skip the linked
  // guards (collectLinkedIdentityIds -> [self] only, no cooldown, no twitter check). Mirrors the lambda, whose
  // caller profile read is an un-caught DynamoDB GetItem that 500s the request on infra failure.
  const callerProfileItem = await readProfileByIdentity(identityId);
  if (!callerProfileItem) {
    return { status: 503, body: { error: 'VERIFICATION_UNAVAILABLE', message: 'Could not verify account eligibility. Please try again.' } };
  }
  const allCallerIds = collectLinkedIdentityIds(identityId, callerProfileItem);
  if (allCallerIds.includes(referrerIdentityId)) {
    return { status: 400, body: { error: 'SELF_REFERRAL', message: 'Cannot use your own referral code' } };
  }

  // Decline cooldown across all linked identities (max lastReferralDeclinedAt).
  const otherCallerIds = allCallerIds.filter((id) => id !== identityId);
  const linkedProfiles = otherCallerIds.length
    ? await Promise.all(otherCallerIds.map((id) => readProfileByIdentity(id)))
    : [];
  let latestDeclinedMs = 0;
  const ownDeclined = callerProfileItem?.lastReferralDeclinedAt as string | undefined;
  if (ownDeclined) latestDeclinedMs = Math.max(latestDeclinedMs, Date.parse(ownDeclined) || 0);
  for (const p of linkedProfiles) {
    const v = p?.lastReferralDeclinedAt as string | undefined;
    if (v) latestDeclinedMs = Math.max(latestDeclinedMs, Date.parse(v) || 0);
  }
  if (latestDeclinedMs > 0) {
    const cooldownMs = DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - latestDeclinedMs < cooldownMs) {
      return {
        status: 403,
        body: {
          error: 'RECENTLY_DECLINED',
          message: 'Your previous referral was declined. You can re-apply later.',
          retryAt: new Date(latestDeclinedMs + cooldownMs).toISOString(),
        },
      };
    }
  }

  // Twitter reuse guard (fail-closed). by-twitter-id returns {matches:[]} on no-match (200) and null only on
  // error -> a null is a lookup failure -> 503 (parity with the lambda's catch -> VERIFICATION_UNAVAILABLE).
  const callerTwitterId = callerProfileItem?.twitterId as string | undefined;
  if (callerTwitterId) {
    const boxed = await readProfilesByTwitterId(callerTwitterId);
    if (!boxed || !Array.isArray(boxed.matches)) {
      return { status: 503, body: { error: 'VERIFICATION_UNAVAILABLE', message: 'Could not verify account eligibility. Please try again.' } };
    }
    const dupIds = (boxed.matches as Array<Record<string, any>>).map((m) => m.identityId as string);
    const callerSelfIds = new Set(allCallerIds);
    const foreignOwner = dupIds.find((id) => !callerSelfIds.has(id));
    if (foreignOwner) {
      return {
        status: 409,
        body: { error: 'TWITTER_REUSED', message: 'Your X account is already linked to another wallet. Referral signup requires a fresh X account.' },
      };
    }
  }

  // Referrer's max referral count.
  const referrerCount = await countReferralsByReferrer(referrerIdentityId);
  if (referrerCount >= MAX_REFERRALS_PER_USER) {
    return { status: 400, body: { error: 'REFERRER_LIMIT_REACHED', message: 'This referrer has reached their maximum referral limit' } };
  }

  // Atomic 1-referral-per-user insert.
  const inserted = await insertReferral(identityId, referrerIdentityId, referralCode, new Date().toISOString());
  if (!inserted) {
    return { status: 409, body: { error: 'ALREADY_APPLIED', message: 'You have already applied a referral code' } };
  }
  return { status: 200, body: { success: true } };
}

// ==================== GET /referral/my-stats ====================

function sortAssignSerialsDesc(items: ReferralItem[]): Array<ReferralItem & { _serial: number }> {
  const ascending = items.slice().sort((a, b) => {
    const ta = Date.parse((a.appliedAt as string) || '') || 0;
    const tb = Date.parse((b.appliedAt as string) || '') || 0;
    return ta - tb;
  });
  const withSerials = ascending.map((item, idx) => ({ ...item, _serial: idx + 1 }));
  return withSerials.slice().reverse();
}

export async function handleMyStats(identityId: string): Promise<Result> {
  const profile = await readProfileByIdentity(identityId);
  const referralCode = (profile?.referralCode as string) || null;

  let sortedRawReferrals: Array<ReferralItem & { _serial: number }> = [];
  let referrals: Array<{ status: string; appliedAt: string; activatedAt: string | null }> = [];
  if (referralCode) {
    const rows = await listReferralsByReferrer(identityId);
    sortedRawReferrals = sortAssignSerialsDesc(rows);
    referrals = sortedRawReferrals.map((item) => ({
      status: item.status,
      appliedAt: (item.appliedAt as string) || '',
      activatedAt: (item.activatedAt as string) || null,
    }));
  }

  const firstPageRaw = sortedRawReferrals.slice(0, REFEREES_INLINE_PAGE_SIZE);
  const refereesNextCursor =
    sortedRawReferrals.length > REFEREES_INLINE_PAGE_SIZE ? encodeOffsetCursor(REFEREES_INLINE_PAGE_SIZE) : null;

  // These three are independent (referee enrich = identity-compute batch; my-referral = PG; bonus stats =
  // explorer-api). Run concurrently to cut the dashboard's primary-endpoint tail latency.
  const [refereeItems, myReferral, bonusStats] = await Promise.all([
    enrichReferees(firstPageRaw),
    getReferralByReferred(identityId),
    referralCode ? fetchReferralStats(identityId) : Promise.resolve(null),
  ]);

  const referredBy = myReferral
    ? {
        referralCode: myReferral.referralCode,
        appliedAt: myReferral.appliedAt,
        status: myReferral.status,
        activatedAt: (myReferral.activatedAt as string) || null,
      }
    : null;

  let declineInfo: Record<string, unknown> | null = null;
  if (myReferral && (myReferral.status === 'DECLINED' || myReferral.status === 'APPEALED')) {
    const reviewedAt = (myReferral.reviewedAt as string) || '';
    const reviewedMs = Date.parse(reviewedAt) || 0;
    const cooldownMs = DECLINE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    declineInfo = {
      status: myReferral.status,
      reviewedAt,
      reviewerNote: (myReferral.reviewerNote as string) || '',
      retryAt: reviewedMs ? new Date(reviewedMs + cooldownMs).toISOString() : '',
      appealedAt: (myReferral.appealedAt as string) || undefined,
      appealText: (myReferral.appealText as string) || undefined,
      appealResolution: (myReferral.appealResolution as string) || undefined,
      appealResolvedAt: (myReferral.appealResolvedAt as string) || undefined,
    };
  }

  return {
    status: 200,
    body: {
      referralCode,
      totalReferrals: referrals.length,
      activatedCount: referrals.filter((r) => r.status === 'ACTIVATED').length,
      pendingCount: referrals.filter((r) => r.status === 'PENDING').length,
      referrals,
      referees: { items: refereeItems, nextCursor: refereesNextCursor },
      referredBy,
      declineInfo,
      bonusStats,
    },
  };
}

// ==================== GET /referral/my-referees ====================

export async function handleMyReferees(identityId: string, query: { cursor?: string; limit?: string }): Promise<Result> {
  const offset = decodeOffsetCursor(query.cursor);
  if (offset === null) {
    return { status: 400, body: { error: 'INVALID_CURSOR', message: 'Cursor is malformed or from an incompatible version' } };
  }
  let limit = parseInt(query.limit || String(REFEREES_INLINE_PAGE_SIZE), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = REFEREES_INLINE_PAGE_SIZE;
  if (limit > REFEREES_MAX_PAGE_SIZE) limit = REFEREES_MAX_PAGE_SIZE;

  const rows = await listReferralsByReferrer(identityId);
  const sorted = sortAssignSerialsDesc(rows);
  const slice = sorted.slice(offset, offset + limit);
  const items = await enrichReferees(slice);
  const nextCursor = sorted.length > offset + limit ? encodeOffsetCursor(offset + limit) : null;
  return { status: 200, body: { items, nextCursor } };
}

// ==================== POST /referral/appeal ====================

export async function handleAppeal(identityId: string, rawBody: string | null): Promise<Result> {
  let appealText: string;
  try {
    const parsed = JSON.parse(rawBody || '{}');
    appealText = ((parsed.appealText as string) || '').trim();
  } catch {
    return { status: 400, body: { error: 'INVALID_BODY', message: 'Invalid request body' } };
  }
  if (appealText.length < 10 || appealText.length > 1000) {
    return { status: 400, body: { error: 'INVALID_APPEAL', message: 'Appeal must be 10-1000 characters' } };
  }

  const now = new Date().toISOString();
  const count = await updateAppeal(identityId, appealText, now);
  if (count === 0) {
    const existing = await getReferralByReferred(identityId);
    if (!existing || existing.status !== 'DECLINED') {
      return { status: 409, body: { error: 'NO_DECLINED_REFERRAL', message: 'No declined referral to appeal' } };
    }
    if (existing.appealedAt) {
      return { status: 409, body: { error: 'ALREADY_APPEALED', message: 'You have already submitted an appeal' } };
    }
    return { status: 409, body: { error: 'CONFLICT', message: 'Appeal could not be submitted' } };
  }
  return { status: 200, body: { ok: true, appealedAt: now } };
}
