// PG write data-access for the box referral service (role nasun_identity, RW on referrals + referral_codes).
// Byte-parity with the DynamoDB mutations: DDB ConditionExpression "attribute_not_exists(PK)" -> PG
// "INSERT ... ON CONFLICT (pk) DO NOTHING" + rowcount; DDB conditional UpdateItem -> PG "UPDATE ... WHERE
// <cas condition>" + rowcount. The promoted columns carry referred/referrer/code/status; everything else
// merges into the attributes jsonb (COALESCE(attributes,'{}') || delta). user_profiles is NEVER written here
// (the referralCode + lastReferralDeclinedAt fields go through identity-compute /profile/attributes-sync).

import { getWriteSql } from './write-pool';

// my-code: reserve a fresh code. Mirrors PutCommand ConditionExpression attribute_not_exists(referralCode).
// Returns false on collision (caller retries with a new code, up to CODE_GENERATION_MAX_RETRIES).
export async function insertCode(referralCode: string, identityId: string, createdAt: string): Promise<boolean> {
  const w = getWriteSql();
  const res = await w`
    INSERT INTO referral_codes (referral_code, identity_id, created_at, attributes)
    VALUES (${referralCode}, ${identityId}, ${createdAt}, '{}'::jsonb)
    ON CONFLICT (referral_code) DO NOTHING`;
  return res.count > 0;
}

// apply: 1-referral-per-user atomic insert. Mirrors PutCommand ConditionExpression
// attribute_not_exists(referredIdentityId). Returns false on conflict (caller -> 409 ALREADY_APPLIED).
// DDB item shape: { referredIdentityId, referrerIdentityId, referralCode, appliedAt, activatedAt:null,
// status:'PENDING' } -> promoted cols + attributes {appliedAt, activatedAt:null}.
export async function insertReferral(
  referredId: string,
  referrerId: string,
  referralCode: string,
  appliedAt: string,
): Promise<boolean> {
  const w = getWriteSql();
  const attrs = { appliedAt, activatedAt: null as string | null };
  const res = await w`
    INSERT INTO referrals (referred_identity_id, referrer_identity_id, referral_code, status, attributes)
    VALUES (${referredId}, ${referrerId}, ${referralCode}, 'PENDING', ${w.json(attrs)})
    ON CONFLICT (referred_identity_id) DO NOTHING`;
  return res.count > 0;
}

// appeal: DECLINED -> APPEALED (one-shot). Mirrors UpdateCommand Cond "attribute_exists(referredIdentityId)
// AND #s = DECLINED AND attribute_not_exists(appealedAt)". Returns rowcount (0 -> caller differentiates).
export async function updateAppeal(referredId: string, appealText: string, now: string): Promise<number> {
  const w = getWriteSql();
  const res = await w`
    UPDATE referrals
    SET status = 'APPEALED',
        attributes = COALESCE(attributes, '{}'::jsonb) || ${w.json({ appealText, appealedAt: now })}
    WHERE referred_identity_id = ${referredId}
      AND status = 'DECLINED'
      AND (attributes->>'appealedAt') IS NULL`;
  return res.count;
}

// admin approve: PENDING -> ACTIVATED. Mirrors UpdateItem Cond "attribute_exists AND #s=PENDING".
export async function approveReferral(referredId: string, now: string, adminId: string): Promise<number> {
  const w = getWriteSql();
  const res = await w`
    UPDATE referrals
    SET status = 'ACTIVATED',
        attributes = COALESCE(attributes, '{}'::jsonb)
          || ${w.json({ activatedAt: now, reviewedAt: now, reviewerIdentityId: adminId })}
    WHERE referred_identity_id = ${referredId} AND status = 'PENDING'`;
  return res.count;
}

// admin decline: PENDING -> DECLINED. Mirrors UpdateItem Cond "attribute_exists AND #s=PENDING".
// The cooldown tombstone (user_profiles.lastReferralDeclinedAt) is a SEPARATE attributes-sync call in the
// handler (best-effort). The already-DECLINED idempotent retry is handled at the handler level.
export async function declineReferral(
  referredId: string,
  reviewerNote: string,
  now: string,
  adminId: string,
): Promise<number> {
  const w = getWriteSql();
  const res = await w`
    UPDATE referrals
    SET status = 'DECLINED',
        attributes = COALESCE(attributes, '{}'::jsonb)
          || ${w.json({ reviewedAt: now, reviewerIdentityId: adminId, reviewerNote })}
    WHERE referred_identity_id = ${referredId} AND status = 'PENDING'`;
  return res.count;
}

// admin resolve-appeal "reverse": APPEALED -> ACTIVATED + appeal metadata. Triggers onboarding backfill
// (handler). Mirrors UpdateItem Cond "attribute_exists AND #s=APPEALED".
export async function resolveAppealReverse(
  referredId: string,
  now: string,
  adminId: string,
  resolverNote: string,
): Promise<number> {
  const w = getWriteSql();
  const delta: Record<string, string> = {
    activatedAt: now,
    appealResolution: 'reversed',
    appealResolvedAt: now,
    appealResolverIdentityId: adminId,
  };
  if (resolverNote) delta.appealResolverNote = resolverNote;
  const res = await w`
    UPDATE referrals
    SET status = 'ACTIVATED',
        attributes = COALESCE(attributes, '{}'::jsonb) || ${w.json(delta)}
    WHERE referred_identity_id = ${referredId} AND status = 'APPEALED'`;
  return res.count;
}

// admin resolve-appeal "reconfirm": APPEALED -> DECLINED + appeal metadata. Mirrors UpdateItem Cond
// "attribute_exists AND #s=APPEALED".
export async function resolveAppealReconfirm(
  referredId: string,
  now: string,
  adminId: string,
  resolverNote: string,
): Promise<number> {
  const w = getWriteSql();
  const delta: Record<string, string> = {
    appealResolution: 'reconfirmed',
    appealResolvedAt: now,
    appealResolverIdentityId: adminId,
  };
  if (resolverNote) delta.appealResolverNote = resolverNote;
  const res = await w`
    UPDATE referrals
    SET status = 'DECLINED',
        attributes = COALESCE(attributes, '{}'::jsonb) || ${w.json(delta)}
    WHERE referred_identity_id = ${referredId} AND status = 'APPEALED'`;
  return res.count;
}

// admin decline idempotent-retry helper: read the current status to distinguish "already DECLINED" (idempotent
// re-apply the cooldown tombstone) from a real conflict. Uses the WRITE pool so it sees the just-committed CAS
// (read-your-write); the read pool could lag a replica. Mirrors the lambda's post-CCFE GetItem(status).
export async function currentStatus(referredId: string): Promise<string | null> {
  const w = getWriteSql();
  const rows = await w<{ status: string | null }[]>`
    SELECT status FROM referrals WHERE referred_identity_id = ${referredId} LIMIT 1`;
  return rows.length ? rows[0].status : null;
}
