// PG read data-access layer for the box bug-report service. Replaces the DynamoDB reads in the bug-report
// lambda + the bug-report-admin/creator-posts-admin reads with byte-parity queries over the EXISTING box
// nasun_dal DAL-mirror tables bug_reports / creator_posts (the DDB->PG "P2" mirror created by dal-load; owner
// nasun_app). READ ONLY (role nasun_compute_ro). Writes live in write-db.ts.
//
// DAL-mirror layout (authoritative, from \d):
//   bug_reports   (report_id text, ts timestamptz, status text, identity_id text, attributes jsonb)
//                 PK (report_id, ts); idx_br_identity(identity_id); idx_br_status(status)
//   creator_posts (post_id text, identity_id text, status text, created_at timestamptz, attributes jsonb)
//                 PK (post_id); idx_cp_identity(identity_id); idx_cp_status_created(status, created_at)
// report_id (randomUUID) and post_id (tweet id) are globally unique, so report_id alone identifies a row even
// though the PK is composite. The DDB sort key `timestamp` is the `ts` timestamptz column, re-surfaced as the
// `timestamp` ISO string in the reconstructed item (postgres.js parses timestamptz -> JS Date -> toISOString,
// which reproduces the original DDB `new Date().toISOString()` string). The long-tail lives in `attributes`
// jsonb; the reconstructors overlay the promoted columns so the returned object is byte-identical to the DDB
// item the lambda read.

import postgres from 'postgres';
import { PG } from './config';

export const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 6, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: 15000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 },
});

// ---- Row shapes (timestamptz columns come back as JS Date from postgres.js) -----------------------

type BugRow = {
  report_id: string;
  ts: Date | string;
  identity_id: string;
  status: string | null;
  attributes: Record<string, unknown> | null;
};
type PostRow = {
  post_id: string;
  identity_id: string;
  created_at: Date | string | null;
  status: string | null;
  attributes: Record<string, unknown> | null;
};

function tsToIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

// DDB-compatible reconstructors (the lambda read these items from DynamoDB).
export function rowToReport(r: BugRow): Record<string, unknown> {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    reportId: r.report_id,
    timestamp: tsToIso(r.ts),
    identityId: r.identity_id,
    status: r.status,
  };
}

export function rowToPost(r: PostRow): Record<string, unknown> {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    postId: r.post_id,
    identityId: r.identity_id,
    createdAt: tsToIso(r.created_at),
    status: r.status,
  };
}

const BUG_COLS = sql`report_id, ts, identity_id, status, attributes`;
const POST_COLS = sql`post_id, identity_id, created_at, status, attributes`;

// ---- bug_reports (read) --------------------------------------------------------------------------

// Cooldown check (submit): any report by this identity newer than `sinceIso`. Bool, uses idx_br_identity.
export async function hasRecentReport(identityId: string, sinceIso: string): Promise<boolean> {
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one FROM bug_reports
    WHERE identity_id = ${identityId} AND ts > ${sinceIso}::timestamptz LIMIT 1`;
  return rows.length > 0;
}

// GET by report_id (admin PATCH existing-check, reply target). report_id is unique (UUID); LIMIT 1 + newest
// ts is defensive against a (theoretically impossible) duplicate report_id.
export async function getReport(reportId: string): Promise<Record<string, unknown> | null> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports WHERE report_id = ${reportId} ORDER BY ts DESC LIMIT 1`;
  return rows.length ? rowToReport(rows[0]) : null;
}

// idx_br_identity: user's own reports, newest first (my-reports, Limit 50).
export async function listReportsByIdentity(identityId: string, limit: number): Promise<Record<string, unknown>[]> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports
    WHERE identity_id = ${identityId}
    ORDER BY ts DESC LIMIT ${limit}`;
  return rows.map(rowToReport);
}

// idx_br_status: admin list by status, newest first (Limit 100).
export async function listReportsByStatus(status: string, limit: number): Promise<Record<string, unknown>[]> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports
    WHERE status = ${status}
    ORDER BY ts DESC LIMIT ${limit}`;
  return rows.map(rowToReport);
}

// Backfill scan: terminal (fixed/accepted) + bonusPoints > 0 + rewardStatus null/pending/pending-no-wallet.
// Bounded table; full scan is fine at devnet scale (parity with the lambda backfill Scan+Filter).
export async function listBackfillCandidates(): Promise<Record<string, unknown>[]> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports
    WHERE status IN ('fixed', 'accepted')
      AND COALESCE((attributes->>'bonusPoints')::numeric, 0) > 0
      AND (
        attributes->>'rewardStatus' IS NULL
        OR attributes->>'rewardStatus' IN ('pending', 'pending-no-wallet')
      )`;
  return rows.map(rowToReport);
}

// All screenshotKeys referenced by non-terminal reports (prune: keep these, delete the rest after retention).
const TERMINAL_BUG_STATUSES = ['fixed', 'wont-fix', 'accepted', 'declined', 'duplicate'];
export async function listActiveScreenshotKeys(): Promise<Set<string>> {
  const rows = await sql<{ key: string }[]>`
    SELECT jsonb_array_elements_text(attributes->'screenshotKeys') AS key
    FROM bug_reports
    WHERE (status IS NULL OR status <> ALL(${sql.array(TERMINAL_BUG_STATUSES)}))
      AND jsonb_typeof(attributes->'screenshotKeys') = 'array'`;
  return new Set(rows.map((r) => r.key));
}

// ---- creator_posts (read) ------------------------------------------------------------------------

// Daily submission count (rate limit): PENDING/SCORED/GRANTED since UTC midnight.
export async function countTodayPosts(identityId: string, startIso: string): Promise<number> {
  const [{ n }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM creator_posts
    WHERE identity_id = ${identityId} AND created_at >= ${startIso}::timestamptz
      AND status IN ('PENDING', 'SCORED', 'GRANTED')`;
  return Number(n) || 0;
}

// GET by PK (grant flow). post_id is the tweet id (unique).
export async function getPost(postId: string): Promise<Record<string, unknown> | null> {
  const rows = await sql<PostRow[]>`
    SELECT ${POST_COLS} FROM creator_posts WHERE post_id = ${postId} LIMIT 1`;
  return rows.length ? rowToPost(rows[0]) : null;
}

// User's own posts (my list), newest first, keyset cursor on (created_at, post_id). CANCELED excluded.
export async function listPostsByIdentity(
  identityId: string,
  limit: number,
  cursor: { createdAt: string; postId: string } | undefined,
): Promise<Record<string, unknown>[]> {
  const rows = cursor
    ? await sql<PostRow[]>`
        SELECT ${POST_COLS} FROM creator_posts
        WHERE identity_id = ${identityId} AND (status IS NULL OR status <> 'CANCELED')
          AND (created_at, post_id) < (${cursor.createdAt}::timestamptz, ${cursor.postId})
        ORDER BY created_at DESC, post_id DESC LIMIT ${limit}`
    : await sql<PostRow[]>`
        SELECT ${POST_COLS} FROM creator_posts
        WHERE identity_id = ${identityId} AND (status IS NULL OR status <> 'CANCELED')
        ORDER BY created_at DESC, post_id DESC LIMIT ${limit}`;
  return rows.map(rowToPost);
}

// Admin list by status, newest first, keyset cursor on (created_at, post_id).
export async function listPostsByStatus(
  status: string,
  limit: number,
  cursor: { createdAt: string; postId: string } | undefined,
): Promise<Record<string, unknown>[]> {
  const rows = cursor
    ? await sql<PostRow[]>`
        SELECT ${POST_COLS} FROM creator_posts
        WHERE status = ${status}
          AND (created_at, post_id) < (${cursor.createdAt}::timestamptz, ${cursor.postId})
        ORDER BY created_at DESC, post_id DESC LIMIT ${limit}`
    : await sql<PostRow[]>`
        SELECT ${POST_COLS} FROM creator_posts
        WHERE status = ${status}
        ORDER BY created_at DESC, post_id DESC LIMIT ${limit}`;
  return rows.map(rowToPost);
}

// ---- user_profiles (admin-role check only; all other profile access goes via identity-compute HTTP) -----

// Box ADMIN role read (compute_ro). role lives in user_profiles attributes jsonb (parity with the referral
// box auth.ts + the lambda authenticateAdmin's UserProfiles role==='ADMIN' check).
export async function getAdminRole(
  identityId: string,
): Promise<{ role: string | null; email: string | null; username: string | null } | null> {
  const rows = await sql<{ role: string | null; email: string | null; username: string | null }[]>`
    SELECT attributes->>'role' AS role, attributes->>'email' AS email, attributes->>'username' AS username
    FROM user_profiles WHERE identity_id = ${identityId} LIMIT 1`;
  return rows.length ? rows[0] : null;
}
