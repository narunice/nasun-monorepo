// Delta data sync for the nasun-bug-report de-Lambda lift: upserts the DynamoDB bug-reports / creator-posts
// onto the EXISTING box nasun_dal DAL mirror (the DDB->PG "P2" tables; the initial dal-load snapshot is stale
// as of ~2026-06-02, so this catches everything created since), plus a stage of the active (non-terminal)
// reports' screenshots from S3 (closed/orphan screenshots are intentionally NOT migrated -- they are
// short-lived triage aids the box prune deletes anyway). Schema (ts/created_at timestamptz, bug PK
// (report_id, ts)) matches the live mirror exactly.
//
// Run on the box from ~/nasun-monorepo (resolves @aws-sdk + postgres from the monorepo node_modules):
//   AWS_PROFILE=nasun-prod AWS_REGION=ap-northeast-2 \
//   DATABASE_URL='postgres://nasun_bug_report:<pw>@127.0.0.1:5432/nasun_dal' \
//   node apps/nasun-website/cdk/lambda-src/bug-report/box/deploy/migrate.mjs [--dry-run]
//
// Then (privileged) place the staged screenshots into the service StateDirectory with matching ownership:
//   sudo cp -a ./bug-screenshots-staging/bug-screenshots /var/lib/nasun-bug-report/screenshots/
//   sudo chown -R --reference=/var/lib/nasun-bug-report /var/lib/nasun-bug-report/screenshots
//
// IDEMPOTENT (pre-cutover only): ON CONFLICT DO UPDATE overwrites each row with the DynamoDB snapshot, so a
// re-run is safe ONLY while DynamoDB is still the sole writer (pre-cutover, and the final delta AT cutover).
// *** Do NOT run this AFTER the nginx /feedback cutover *** -- once the box is SoT, admins/users write directly
// to PG (score/grant/reply/reward bookkeeping); a re-run would DO UPDATE those rows back to the stale DynamoDB
// state (e.g. revert a GRANTED post to PENDING, erase grantTxDigest -> double-grant). The PG tables + grants
// must already exist (deploy/grants.sql).

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import postgres from 'postgres';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DRY_RUN = process.argv.includes('--dry-run');
const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const BUG_TABLE = process.env.BUG_REPORTS_TABLE || 'nasun-bug-reports';
const POST_TABLE = process.env.CREATOR_POSTS_TABLE || 'nasun-creator-posts';
const SCREENSHOT_BUCKET = process.env.BUG_SCREENSHOT_BUCKET || 'nasun-internal-cache-466841130170';
const STAGING_DIR = process.env.SCREENSHOT_STAGING_DIR || './bug-screenshots-staging';
const DATABASE_URL = process.env.DATABASE_URL;

const TERMINAL_BUG_STATUSES = new Set(['fixed', 'wont-fix', 'accepted', 'declined', 'duplicate']);

if (!DATABASE_URL && !DRY_RUN) {
  console.error('FATAL: DATABASE_URL is required (unless --dry-run).');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });
const sql = DATABASE_URL ? postgres(DATABASE_URL, { prepare: false, onnotice: () => {} }) : null;

async function* scanAll(tableName) {
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    for (const item of out.Items || []) yield item;
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
}

async function migrateBugReports() {
  let count = 0;
  const activeKeys = [];
  for await (const item of scanAll(BUG_TABLE)) {
    const { reportId, timestamp, identityId, status, ...attributes } = item;
    if (!reportId || !timestamp || !identityId) {
      console.warn(`[migrate] skip malformed bug_report (missing key): ${JSON.stringify({ reportId, timestamp, identityId })}`);
      continue;
    }
    const st = status || 'new';
    if (!DRY_RUN) {
      // ts is the timestamptz column (DDB `timestamp` ISO). PK is (report_id, ts), stable per report (DDB sort
      // key is immutable), so ON CONFLICT (report_id, ts) matches the mirrored row; new rows insert.
      await sql`
        INSERT INTO bug_reports (report_id, ts, identity_id, status, attributes)
        VALUES (${reportId}, ${timestamp}::timestamptz, ${identityId}, ${st}, ${sql.json(attributes)})
        ON CONFLICT (report_id, ts) DO UPDATE
          SET identity_id = EXCLUDED.identity_id, status = EXCLUDED.status, attributes = EXCLUDED.attributes`;
    }
    // Stage screenshots only for non-terminal reports.
    if (!TERMINAL_BUG_STATUSES.has(st) && Array.isArray(attributes.screenshotKeys)) {
      for (const k of attributes.screenshotKeys) {
        if (typeof k === 'string' && k.startsWith('bug-screenshots/') && !k.includes('..')) activeKeys.push(k);
      }
    }
    count++;
  }
  console.log(`[migrate] bug_reports: ${count} rows ${DRY_RUN ? '(dry-run)' : 'upserted'}, ${activeKeys.length} active screenshot keys`);
  return activeKeys;
}

async function migrateCreatorPosts() {
  let count = 0;
  for await (const item of scanAll(POST_TABLE)) {
    const { postId, identityId, createdAt, status, ...attributes } = item;
    if (!postId || !identityId || !createdAt) {
      console.warn(`[migrate] skip malformed creator_post (missing key): ${JSON.stringify({ postId, identityId, createdAt })}`);
      continue;
    }
    const st = status || 'PENDING';
    if (!DRY_RUN) {
      // created_at is the timestamptz column (DDB `createdAt` ISO). PK is (post_id), single.
      await sql`
        INSERT INTO creator_posts (post_id, identity_id, created_at, status, attributes)
        VALUES (${postId}, ${identityId}, ${createdAt}::timestamptz, ${st}, ${sql.json(attributes)})
        ON CONFLICT (post_id) DO UPDATE
          SET identity_id = EXCLUDED.identity_id, created_at = EXCLUDED.created_at,
              status = EXCLUDED.status, attributes = EXCLUDED.attributes`;
    }
    count++;
  }
  console.log(`[migrate] creator_posts: ${count} rows ${DRY_RUN ? '(dry-run)' : 'upserted'}`);
}

async function stageScreenshots(keys) {
  let staged = 0, skipped = 0, missing = 0;
  for (const key of keys) {
    const dest = join(STAGING_DIR, key);
    try {
      await access(dest);
      skipped++;
      continue; // already staged (idempotent)
    } catch { /* not staged yet */ }
    if (DRY_RUN) { staged++; continue; }
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: SCREENSHOT_BUCKET, Key: key }));
      const body = Buffer.from(await obj.Body.transformToByteArray());
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, body, { mode: 0o644 });
      staged++;
    } catch (err) {
      missing++;
      console.warn(`[migrate] screenshot missing/failed s3://${SCREENSHOT_BUCKET}/${key}: ${err?.name || err}`);
    }
  }
  console.log(`[migrate] screenshots: staged=${staged} skipped=${skipped} missing=${missing} -> ${STAGING_DIR}`);
}

(async () => {
  console.log(`[migrate] start dry-run=${DRY_RUN} region=${REGION} bucket=${SCREENSHOT_BUCKET}`);
  const activeKeys = await migrateBugReports();
  await migrateCreatorPosts();
  await stageScreenshots(activeKeys);
  if (sql) await sql.end({ timeout: 5 });
  console.log('[migrate] done');
})().catch((err) => {
  console.error('[migrate] FATAL:', err);
  process.exit(1);
});
