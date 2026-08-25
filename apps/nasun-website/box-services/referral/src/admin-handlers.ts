// Admin referral-review routes, byte-parity port of the admin-api export-whitelist.ts referral handlers
// (/admin/referral-review GET + /approve + /decline + /resolve-appeal POST) onto box PG. status CAS via
// write-db; profile enrich + onboarding backfill via identity-compute / explorer-api. The cooldown tombstone
// (lastReferralDeclinedAt) goes through identity-compute attributes-sync (user_profiles single-writer).

import { listReferralsByStatus, type ReferralItem } from './db';
import {
  approveReferral,
  declineReferral,
  resolveAppealReverse,
  resolveAppealReconfirm,
  currentStatus,
} from './write-db';
import { readProfileByIdentity, profileBatch, attributesSyncBestEffort, grantOnboardingBonus } from './clients';
import type { AdminUser } from './auth';

export interface Result {
  status: number;
  body: Record<string, unknown>;
}

// ---- shared: onboarding bonus backfill (approve + appeal-reverse) ---------------------------------
// Reads the referee's profile (identity-compute), then grants the social onboarding bonuses the referee
// already earned. The referral is ACTIVATED at this point, so each grant is unconditional (parity with the
// lambda grantIfReferralActivated GRANT path). Non-blocking: failures are logged, never fail the response.
async function onboardingBackfill(referredId: string): Promise<void> {
  const item = await readProfileByIdentity(referredId);
  if (!item) return;
  const twitterId = item.twitterId as string | undefined;
  const telegramUserId = item.telegramUserId as string | undefined;
  const provider = (item.provider as string | undefined)?.toLowerCase();
  const googleSecondaryId = item.linkedAccounts?.google?.identityId as string | undefined;
  const googleExternalId = googleSecondaryId || (provider === 'google' ? referredId : undefined);
  const walletAddress = (item.walletAddress as string | undefined) ?? null;

  const tasks: Promise<void>[] = [];
  if (twitterId) {
    tasks.push(
      grantOnboardingBonus('follow-nasun', twitterId, referredId, walletAddress),
      grantOnboardingBonus('x-link', twitterId, referredId, walletAddress),
    );
  }
  if (googleExternalId) tasks.push(grantOnboardingBonus('google-link', googleExternalId, referredId, walletAddress));
  if (telegramUserId) tasks.push(grantOnboardingBonus('telegram-link', telegramUserId, referredId, walletAddress));
  await Promise.allSettled(tasks);
}

// ==================== GET /admin/referral-review?status= ====================

export async function listReferralReview(query: Record<string, string | undefined>): Promise<Result> {
  const statusRaw = (query.status || 'PENDING').toUpperCase();
  if (!['PENDING', 'APPEALED', 'DECLINED', 'ACTIVATED'].includes(statusRaw)) {
    return { status: 400, body: { error: 'Invalid status' } };
  }
  const status = statusRaw;
  const rawItems = await listReferralsByStatus(status);

  // Sort ASC by the status-relevant timestamp, oldest first -> serial 1 (parity with the lambda).
  const sortField =
    status === 'APPEALED' ? 'appealedAt' : status === 'DECLINED' ? 'reviewedAt' : status === 'ACTIVATED' ? 'activatedAt' : 'appliedAt';
  rawItems.sort((a, b) => {
    const ta = Date.parse(((a[sortField] as string) || (a.appliedAt as string) || '')) || 0;
    const tb = Date.parse(((b[sortField] as string) || (b.appliedAt as string) || '')) || 0;
    return ta - tb;
  });

  const refereeIds = rawItems.map((i) => i.referredIdentityId).filter(Boolean);
  const referrerIds = [...new Set(rawItems.map((i) => i.referrerIdentityId).filter(Boolean))];
  const profiles = await profileBatch([...new Set([...refereeIds, ...referrerIds])]);

  const items = rawItems.map((it, idx) => {
    const refProfile = profiles[it.referredIdentityId] || {};
    const rerProfile = profiles[it.referrerIdentityId] || {};
    return {
      serial: idx + 1,
      referredIdentityId: it.referredIdentityId,
      referrerIdentityId: it.referrerIdentityId,
      twitterHandle: (refProfile.twitterHandle as string) || null,
      twitterLinked: Boolean(refProfile.twitterId),
      referrerHandle: (rerProfile.twitterHandle as string) || null,
      referralCode: it.referralCode || null,
      appliedAt: (it.appliedAt as string) || null,
      activatedAt: (it.activatedAt as string) || null,
      reviewedAt: (it.reviewedAt as string) || null,
      reviewerNote: (it.reviewerNote as string) || null,
      appealedAt: (it.appealedAt as string) || null,
      appealText: (it.appealText as string) || null,
      appealResolution: (it.appealResolution as string) || null,
      appealResolvedAt: (it.appealResolvedAt as string) || null,
    };
  });

  return { status: 200, body: { items, total: items.length, status } };
}

// ==================== POST /admin/referral-review/approve ====================

export async function approveHandler(body: Record<string, unknown>, admin: AdminUser): Promise<Result> {
  const referredId = body.identityId as string | undefined;
  if (!referredId || typeof referredId !== 'string') {
    return { status: 400, body: { error: 'identityId is required' } };
  }
  const now = new Date().toISOString();
  const count = await approveReferral(referredId, now, admin.identityId);
  if (count === 0) {
    return { status: 409, body: { error: 'Already reviewed or referral missing' } };
  }
  await onboardingBackfill(referredId); // non-blocking internally
  return { status: 200, body: { activated: 1, identityId: referredId } };
}

// ==================== POST /admin/referral-review/decline ====================

export async function declineHandler(body: Record<string, unknown>, admin: AdminUser): Promise<Result> {
  const referredId = body.identityId as string | undefined;
  const reviewerNote = ((body.reviewerNote as string | undefined) || '').trim();
  if (!referredId || typeof referredId !== 'string') {
    return { status: 400, body: { error: 'identityId is required' } };
  }
  if (reviewerNote.length < 10 || reviewerNote.length > 500) {
    return { status: 400, body: { error: 'reviewerNote must be 10-500 characters' } };
  }
  const now = new Date().toISOString();
  const count = await declineReferral(referredId, reviewerNote, now, admin.identityId);
  if (count === 0) {
    // CAS miss: distinguish already-DECLINED (idempotent re-apply tombstone) from a real conflict (parity
    // with the lambda's post-CCFE status read + retry-trap fix).
    const cur = await currentStatus(referredId);
    if (cur !== 'DECLINED') {
      return { status: 409, body: { error: 'Already reviewed or referral missing' } };
    }
    // already DECLINED: fall through to idempotently re-apply the cooldown tombstone.
  }
  // 30-day cooldown tombstone on user_profiles via identity-compute (best-effort; the decline already
  // committed, so a tombstone failure must not fail the decline).
  await attributesSyncBestEffort(referredId, { lastReferralDeclinedAt: now });
  return { status: 200, body: { declined: 1, identityId: referredId } };
}

// ==================== POST /admin/referral-review/resolve-appeal ====================

export async function resolveAppealHandler(body: Record<string, unknown>, admin: AdminUser): Promise<Result> {
  const referredId = body.identityId as string | undefined;
  const action = body.action as string | undefined;
  const resolverNote = ((body.resolverNote as string | undefined) || '').trim();
  if (!referredId || typeof referredId !== 'string') {
    return { status: 400, body: { error: 'identityId is required' } };
  }
  if (action !== 'reverse' && action !== 'reconfirm') {
    return { status: 400, body: { error: "action must be 'reverse' or 'reconfirm'" } };
  }
  if (resolverNote.length > 500) {
    return { status: 400, body: { error: 'resolverNote must be <= 500 characters' } };
  }
  const now = new Date().toISOString();
  if (action === 'reverse') {
    const count = await resolveAppealReverse(referredId, now, admin.identityId, resolverNote);
    if (count === 0) return { status: 409, body: { error: 'Referral is not in APPEALED state' } };
    await onboardingBackfill(referredId); // mirrors the approve backfill
  } else {
    const count = await resolveAppealReconfirm(referredId, now, admin.identityId, resolverNote);
    if (count === 0) return { status: 409, body: { error: 'Referral is not in APPEALED state' } };
  }
  return { status: 200, body: { resolved: 1, action, identityId: referredId } };
}
