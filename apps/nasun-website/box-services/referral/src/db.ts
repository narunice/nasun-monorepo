// PG read data-access layer for the box referral service. Replaces the DynamoDB reads in the referral
// lambda (handler/index.ts) + the admin referral-review reads with byte-parity queries over the box
// nasun_dal referrals / referral_codes mirror (Phase 1). READ ONLY (role nasun_compute_ro). Writes live in
// write-db.ts (role nasun_identity).
//
// Mirror layout (Phase 1 dal-load): promoted typed columns (referrals: referred_identity_id / referrer_
// identity_id / referral_code / status; referral_codes: referral_code / identity_id / created_at) + the full
// long-tail in `attributes` jsonb (appliedAt/activatedAt/reviewedAt/reviewerNote/reviewerIdentityId/
// appealedAt/appealText/appealResolution/appealResolvedAt/appealResolverIdentityId/appealResolverNote). The
// reconstructors overlay the promoted columns on top of `attributes` so the returned object is byte-identical
// to the DynamoDB item the lambda would have read.

import postgres from 'postgres';
import { PG } from './config';

export const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 6, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: 15000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 },
});

// ---- Item shapes (DDB-compatible: the lambda read these from DynamoDB) ----------------------------

export interface ReferralItem {
  referredIdentityId: string;
  referrerIdentityId: string;
  referralCode: string | null;
  status: string;
  appliedAt?: string;
  activatedAt?: string | null;
  reviewedAt?: string;
  reviewerNote?: string;
  reviewerIdentityId?: string;
  appealedAt?: string;
  appealText?: string;
  appealResolution?: 'reversed' | 'reconfirmed';
  appealResolvedAt?: string;
  appealResolverIdentityId?: string;
  appealResolverNote?: string;
  [k: string]: unknown;
}

export interface CodeItem {
  referralCode: string;
  identityId: string;
  createdAt: string | null;
  [k: string]: unknown;
}

type ReferralRow = {
  referred_identity_id: string;
  referrer_identity_id: string | null;
  referral_code: string | null;
  status: string | null;
  attributes: Record<string, unknown> | null;
};
type CodeRow = {
  referral_code: string;
  identity_id: string | null;
  created_at: string | null;
  attributes: Record<string, unknown> | null;
};

function rowToReferral(r: ReferralRow): ReferralItem {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    referredIdentityId: r.referred_identity_id,
    referrerIdentityId: (r.referrer_identity_id ?? (a.referrerIdentityId as string)) as string,
    referralCode: r.referral_code ?? ((a.referralCode as string) ?? null),
    status: (r.status ?? (a.status as string)) as string,
  } as ReferralItem;
}

function rowToCode(r: CodeRow): CodeItem {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    referralCode: r.referral_code,
    identityId: (r.identity_id ?? (a.identityId as string)) as string,
    createdAt: r.created_at ?? ((a.createdAt as string) ?? null),
  } as CodeItem;
}

const REFERRAL_COLS = sql`referred_identity_id, referrer_identity_id, referral_code, status, attributes`;

// ---- referral_codes ------------------------------------------------------------------------------

// Reverse lookup: code -> identityId (POST /apply step 2). Null when the code does not exist.
export async function getCodeByCode(referralCode: string): Promise<CodeItem | null> {
  const rows = await sql<CodeRow[]>`
    SELECT referral_code, identity_id, created_at, attributes
    FROM referral_codes WHERE referral_code = ${referralCode} LIMIT 1`;
  return rows.length ? rowToCode(rows[0]) : null;
}

// ---- referrals -----------------------------------------------------------------------------------

// GetItem by PK referredIdentityId (apply self/cooldown reads, my-stats referredBy, appeal target).
export async function getReferralByReferred(referredIdentityId: string): Promise<ReferralItem | null> {
  const rows = await sql<ReferralRow[]>`
    SELECT ${REFERRAL_COLS} FROM referrals WHERE referred_identity_id = ${referredIdentityId} LIMIT 1`;
  return rows.length ? rowToReferral(rows[0]) : null;
}

// GSI referrerIdentityId-index: all referrals by referrer (my-stats / my-referees lists).
export async function listReferralsByReferrer(referrerIdentityId: string): Promise<ReferralItem[]> {
  const rows = await sql<ReferralRow[]>`
    SELECT ${REFERRAL_COLS} FROM referrals WHERE referrer_identity_id = ${referrerIdentityId}`;
  return rows.map(rowToReferral);
}

// GSI COUNT (apply step 4: MAX_REFERRALS_PER_USER guard).
export async function countReferralsByReferrer(referrerIdentityId: string): Promise<number> {
  const [{ n }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM referrals WHERE referrer_identity_id = ${referrerIdentityId}`;
  return Number(n) || 0;
}

// Scan by status (admin referral-review list, internal referral-mappings). Bounded (hundreds at devnet scale).
export async function listReferralsByStatus(status: string): Promise<ReferralItem[]> {
  const rows = await sql<ReferralRow[]>`
    SELECT ${REFERRAL_COLS} FROM referrals WHERE status = ${status}`;
  return rows.map(rowToReferral);
}

// All referrals (internal referral-mappings: the lambda scans the full table to compute totalRelationships +
// filter ACTIVATED). Bounded (129 rows at devnet scale).
export async function listAllReferrals(): Promise<ReferralItem[]> {
  const rows = await sql<ReferralRow[]>`SELECT ${REFERRAL_COLS} FROM referrals`;
  return rows.map(rowToReferral);
}

// ---- user_profiles (admin-role check only; all other profile access goes via identity-compute HTTP) -----

// Box ADMIN role read (compute_ro). role/email/username live in user_profiles attributes jsonb (no promoted
// columns for them in the box mirror) -- parity with the leaderboard box auth.ts.
export async function getAdminRole(
  identityId: string,
): Promise<{ role: string | null; email: string | null; username: string | null } | null> {
  const rows = await sql<{ role: string | null; email: string | null; username: string | null }[]>`
    SELECT attributes->>'role' AS role, attributes->>'email' AS email, attributes->>'username' AS username
    FROM user_profiles WHERE identity_id = ${identityId} LIMIT 1`;
  return rows.length ? rows[0] : null;
}
