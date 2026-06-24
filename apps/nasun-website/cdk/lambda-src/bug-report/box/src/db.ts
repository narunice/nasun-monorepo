// PG read data-access layer for the box bug-report service. Replaces the DynamoDB reads in the bug-report
// lambda + the bug-report-admin/creator-posts-admin reads with byte-parity queries over the box nasun_dal
// bug_reports / creator_posts mirror. READ ONLY (role nasun_compute_ro). Writes live in write-db.ts.
//
// Mirror layout: promoted typed columns (bug_reports: report_id PK / report_ts / identity_id / status;
// creator_posts: post_id PK / identity_id / created_at / status) + the full long-tail in `attributes` jsonb.
// The reconstructors overlay the promoted columns on top of `attributes` so the returned object is byte-
// identical to the DynamoDB item the lambda would have read. report_id (randomUUID) and post_id (tweet id) are
// globally unique, so they serve as the PK; the DDB sort key `timestamp` becomes the report_ts column and is
// re-surfaced as `timestamp` in the reconstructed item (clients pass it back but lookups key on report_id).

import postgres from 'postgres';
import { PG } from './config';

export const sql = postgres({
  host: PG.host, port: PG.port, database: PG.database, username: PG.username, password: PG.password,
  max: 6, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: 15000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 },
});

// ---- Row shapes ----------------------------------------------------------------------------------

type BugRow = {
  report_id: string;
  report_ts: string;
  identity_id: string;
  status: string;
  attributes: Record<string, unknown> | null;
};
type PostRow = {
  post_id: string;
  identity_id: string;
  created_at: string;
  status: string;
  attributes: Record<string, unknown> | null;
};

// DDB-compatible reconstructors (the lambda read these items from DynamoDB).
export function rowToReport(r: BugRow): Record<string, unknown> {
  const a = (r.attributes || {}) as Record<string, unknown>;
  return {
    ...a,
    reportId: r.report_id,
    timestamp: r.report_ts,
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
    createdAt: r.created_at,
    status: r.status,
  };
}

const BUG_COLS = sql`report_id, report_ts, identity_id, status, attributes`;
const POST_COLS = sql`post_id, identity_id, created_at, status, attributes`;

// ---- bug_reports (read) --------------------------------------------------------------------------

// Cooldown check (submit): any report by this identity newer than `sinceIso`. Bool, uses identity index.
export async function hasRecentReport(identityId: string, sinceIso: string): Promise<boolean> {
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one FROM bug_reports
    WHERE identity_id = ${identityId} AND report_ts > ${sinceIso} LIMIT 1`;
  return rows.length > 0;
}

// GET by PK (admin PATCH existing-check, reply target). report_id is unique (UUID).
export async function getReport(reportId: string): Promise<Record<string, unknown> | null> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports WHERE report_id = ${reportId} LIMIT 1`;
  return rows.length ? rowToReport(rows[0]) : null;
}

// identityId-index: user's own reports, newest first (my-reports, Limit 50).
export async function listReportsByIdentity(identityId: string, limit: number): Promise<Record<string, unknown>[]> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports
    WHERE identity_id = ${identityId}
    ORDER BY report_ts DESC LIMIT ${limit}`;
  return rows.map(rowToReport);
}

// status-index: admin list by status, newest first (Limit 100).
export async function listReportsByStatus(status: string, limit: number): Promise<Record<string, unknown>[]> {
  const rows = await sql<BugRow[]>`
    SELECT ${BUG_COLS} FROM bug_reports
    WHERE status = ${status}
    ORDER BY report_ts DESC LIMIT ${limit}`;
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
    WHERE status <> ALL(${sql.array(TERMINAL_BUG_STATUSES)})
      AND jsonb_typeof(attributes->'screenshotKeys') = 'array'`;
  return new Set(rows.map((r) => r.key));
}

// ---- creator_posts (read) ------------------------------------------------------------------------

// Daily submission count (rate limit): PENDING/SCORED/GRANTED since UTC midnight.
export async function countTodayPosts(identityId: string, startIso: string): Promise<number> {
  const [{ n }] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM creator_posts
    WHERE identity_id = ${identityId} AND created_at >= ${startIso}
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
        WHERE identity_id = ${identityId} AND status <> 'CANCELED'
          AND (created_at, post_id) < (${cursor.createdAt}, ${cursor.postId})
        ORDER BY created_at DESC, post_id DESC LIMIT ${limit}`
    : await sql<PostRow[]>`
        SELECT ${POST_COLS} FROM creator_posts
        WHERE identity_id = ${identityId} AND status <> 'CANCELED'
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
          AND (created_at, post_id) < (${cursor.createdAt}, ${cursor.postId})
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
