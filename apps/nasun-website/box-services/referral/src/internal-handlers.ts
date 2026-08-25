// Internal referral routes (x-api-key, cross-host callers on node-3 explorer-api).
//
// 1. GET /internal/referral-mappings: byte-parity with the admin-api export-whitelist.ts referral-mappings
//    (ACTIVATED + 180d expiry from activatedAt||appliedAt, both-absent = non-expired). Emits referralsV2
//    (version 2) + the legacy `referrals` map + stats. Returned DIRECTLY as JSON (no S3 presign offload --
//    129 rows; the consumer fetchWithOffload handles direct JSON). The scanner refuses a V1-only payload, so
//    `version:2` + referralsV2 are mandatory.
// 2. GET /internal/referral-activated/:id: the onboarding-bonus gate flip target. Returns { activated:bool }.
//    The explorer-api caller treats any non-200 as activated=false (FAIL-CLOSED) -- so a box outage can never
//    grant a bonus to a non-activated signup (anti-Sybil).
//
// NOT ported: POST /internal/referral-activate (batch PENDING->ACTIVATED). Its only caller is the one-time
// migrate-referral-status.ts script; the explorer-api scanner does NOT call it (verified). Dead post-cutover.

import { listAllReferrals, getReferralByReferred } from './db';

export interface Result {
  status: number;
  body: Record<string, unknown>;
}

const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;

export async function referralMappings(): Promise<Result> {
  const now = Date.now();
  const referrals: Record<string, string> = {};
  const referralsV2: Record<string, { referrerId: string; activatedAt: string | null }> = {};
  let totalRelationships = 0;
  let totalActivated = 0;
  let totalExpired = 0;

  const rows = await listAllReferrals();
  for (const it of rows) {
    const referredId = it.referredIdentityId;
    const referrerId = it.referrerIdentityId;
    const status = it.status;
    if (referredId && referrerId) {
      totalRelationships++;
      if (status === 'ACTIVATED') {
        const activatedAt = it.activatedAt as string | undefined;
        const appliedAt = it.appliedAt as string | undefined;
        const expiryAnchor = activatedAt || appliedAt;
        if (expiryAnchor) {
          const anchorMs = Date.parse(expiryAnchor);
          if (!isNaN(anchorMs) && now - anchorMs > EXPIRY_MS) {
            totalExpired++;
            continue;
          }
        }
        referrals[referredId] = referrerId;
        referralsV2[referredId] = { referrerId, activatedAt: (it.activatedAt as string) || null };
        totalActivated++;
      }
    }
  }

  // stats payload is byte-parity with the lambda: { totalRelationships, totalActivated } only (totalExpired is
  // logged, never serialized -- the scanner refuses a V1-only payload and reads referralsV2; an extra stats
  // key would diverge the documented version:2 contract).
  console.log(`[referral] mappings: ${totalRelationships} total, ${totalActivated} activated, ${totalExpired} expired`);
  return {
    status: 200,
    body: { version: 2, referrals, referralsV2, stats: { totalRelationships, totalActivated } },
  };
}

// Onboarding-bonus gate flip target (explorer-api isReferralActivated). { activated:bool }. The caller treats
// any non-200/timeout as activated=false (fail-closed).
export async function referralActivated(identityId: string): Promise<Result> {
  const item = await getReferralByReferred(identityId);
  return { status: 200, body: { activated: item?.status === 'ACTIVATED' } };
}
