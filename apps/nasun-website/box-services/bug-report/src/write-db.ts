// PG write data-access layer for the box bug-report service (role nasun_bug_report). Replaces the DynamoDB
// PutCommand/UpdateCommand mutations with byte-parity SQL. DDB conditional writes (ConditionExpression) map to
// PG conditional UPDATE ... WHERE ... RETURNING; a 0-row result is the ConditionalCheckFailedException
// equivalent, which the handler resolves by re-reading the current row (PG is strongly consistent, so no
// ConsistentRead flag is needed). Long-tail attributes merge via `attributes || $patch::jsonb` (shallow,
// single driver serialization through sql.json -- NOT JSON.stringify, which double-encodes).

import { getWriteSql } from './write-pool';

// porsager sql.json() expects a JSONValue; our attribute/patch objects are typed Record<string, unknown>. Their
// values are always JSON-serializable (string/number/null/string[]), so cast through the sql.json param type
// (single driver serialization -- NOT JSON.stringify, which double-encodes into a jsonb string).
type SqlJson = Parameters<ReturnType<typeof getWriteSql>['json']>[0];
const j = (v: Record<string, unknown>): SqlJson => v as unknown as SqlJson;

// ---- bug_reports -----------------------------------------------------------------------------------

// Submit: plain insert. `reportTs` is an ISO string (cast to the ts timestamptz column); `attributes` is the
// long-tail object (everything except the promoted columns).
export async function insertReport(
  reportId: string,
  reportTs: string,
  identityId: string,
  status: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  const sql = getWriteSql();
  await sql`
    INSERT INTO bug_reports (report_id, ts, identity_id, status, attributes)
    VALUES (${reportId}, ${reportTs}::timestamptz, ${identityId}, ${status}, ${sql.json(j(attributes))})`;
}

// Reply on a closed ticket: conditional reopen. Parity with the lambda ConditionExpression
// `identityId = :me AND status IN (fixed, wont-fix)`. Returns true on success; on 0 rows the caller
// re-reads to distinguish 404 / 403 (forgery) / 409 (not open).
export async function reopenReport(
  reportId: string,
  identityId: string,
  userReply: string,
  nowIso: string,
): Promise<boolean> {
  const sql = getWriteSql();
  const rows = await sql<{ report_id: string }[]>`
    UPDATE bug_reports
    SET status = 'new',
        attributes = attributes || ${sql.json(j({ userReply, updatedAt: nowIso }))}::jsonb
    WHERE report_id = ${reportId}
      AND identity_id = ${identityId}
      AND status IN ('fixed', 'wont-fix')
    RETURNING report_id`;
  return rows.length > 0;
}

// Admin PATCH: set the promoted status (when provided) + merge the attribute patch (adminNote / bonusPoints /
// updatedAt). status is COALESCEd so a null leaves it unchanged (split-PATCH parity).
export async function updateReportAdmin(
  reportId: string,
  status: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  const sql = getWriteSql();
  await sql`
    UPDATE bug_reports
    SET status = COALESCE(${status}, status),
        attributes = attributes || ${sql.json(j(patch))}::jsonb
    WHERE report_id = ${reportId}`;
}

// Reward bookkeeping merge (rewardStatus / rewardType / creditedAmount / deltaSeq). Used by the admin reward
// path + the backfill. status is untouched.
export async function setReportAttributes(reportId: string, patch: Record<string, unknown>): Promise<void> {
  const sql = getWriteSql();
  await sql`
    UPDATE bug_reports
    SET attributes = attributes || ${sql.json(j(patch))}::jsonb
    WHERE report_id = ${reportId}`;
}

// ---- creator_posts ---------------------------------------------------------------------------------

// Submit: conditional insert (permanent per-tweet uniqueness). Parity with `attribute_not_exists(postId)`.
// Returns true on insert, false on conflict (already submitted -> 409).
export async function insertPost(
  postId: string,
  identityId: string,
  createdAt: string,
  status: string,
  attributes: Record<string, unknown>,
): Promise<boolean> {
  const sql = getWriteSql();
  const rows = await sql<{ post_id: string }[]>`
    INSERT INTO creator_posts (post_id, identity_id, created_at, status, attributes)
    VALUES (${postId}, ${identityId}, ${createdAt}::timestamptz, ${status}, ${sql.json(j(attributes))})
    ON CONFLICT (post_id) DO NOTHING
    RETURNING post_id`;
  return rows.length > 0;
}

// Score: PENDING/SCORED -> SCORED. Returns false on 0 rows (invalid state -> 409).
export async function scorePost(
  postId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const sql = getWriteSql();
  const rows = await sql<{ post_id: string }[]>`
    UPDATE creator_posts
    SET status = 'SCORED', attributes = attributes || ${sql.json(j(patch))}::jsonb
    WHERE post_id = ${postId} AND status IN ('PENDING', 'SCORED')
    RETURNING post_id`;
  return rows.length > 0;
}

// Reject: PENDING/SCORED -> REJECTED. Returns false on 0 rows (invalid state -> 409).
export async function rejectPost(
  postId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const sql = getWriteSql();
  const rows = await sql<{ post_id: string }[]>`
    UPDATE creator_posts
    SET status = 'REJECTED', attributes = attributes || ${sql.json(j(patch))}::jsonb
    WHERE post_id = ${postId} AND status IN ('PENDING', 'SCORED')
    RETURNING post_id`;
  return rows.length > 0;
}

// Grant commit (after the explorer reward succeeded): SCORED -> GRANTED, idempotent on the grant digest.
// Parity with the lambda ConditionExpression `status = SCORED OR (attribute_exists(grantTxDigest) AND
// grantTxDigest = :digest)`. Returns false on 0 rows; the caller re-reads to resolve race / invalid state.
export async function commitGrant(
  postId: string,
  expectedDigest: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const sql = getWriteSql();
  const rows = await sql<{ post_id: string }[]>`
    UPDATE creator_posts
    SET status = 'GRANTED', attributes = attributes || ${sql.json(j(patch))}::jsonb
    WHERE post_id = ${postId}
      AND (status = 'SCORED' OR attributes->>'grantTxDigest' = ${expectedDigest})
    RETURNING post_id`;
  return rows.length > 0;
}
