/**
 * Existing PENDING Referrals Migration (one-shot)
 *
 * Why: pre-launch users on the old auto-activation rule (5 distinct activity
 * days) expected to be auto-promoted to ACTIVATED. The new manual-review flow
 * would force them into the admin queue — surprise + wait. This script
 * promotes only the pre-launch PENDING users that already met the old rule
 * (>= 5 distinct active days AND appliedAt > 5 days ago) before the new
 * frontend ships.
 *
 * Runs in network-explorer api-server context where pointsDb (PostgreSQL
 * activity_points) is wired. DDB UpdateItem is direct (no API call) so we
 * get ConditionExpression race-safety.
 *
 * Usage:
 *   cd apps/network-explorer/api-server
 *   set -a && source .env && set +a
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/migrate-existing-pending-referrals.ts
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/migrate-existing-pending-referrals.ts --execute
 *
 * Required env: REFERRALS_TABLE (default nasun-referrals), DATABASE_URL.
 *
 * Idempotent: ConditionExpression `status = PENDING` ensures already-ACTIVATED
 * rows are skipped on re-run.
 */

import postgres from 'postgres';
import { DynamoDBClient, ScanCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const REFERRALS_TABLE = process.env.REFERRALS_TABLE || 'nasun-referrals';
const REGION = process.env.AWS_REGION || 'ap-northeast-2';
const DATABASE_URL = process.env.DATABASE_URL;
const EXECUTE = process.argv.includes('--execute');

const MIN_DISTINCT_DAYS = 5;
const MIN_APPLIED_AGE_DAYS = 5;

if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is required');
  process.exit(1);
}

const ddb = new DynamoDBClient({ region: REGION });
const pg = postgres(DATABASE_URL, { max: 4 });

interface PendingRow {
  referredIdentityId: string;
  appliedAt: string | null;
}

async function scanPending(): Promise<PendingRow[]> {
  const out: PendingRow[] = [];
  let lastKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: REFERRALS_TABLE,
        FilterExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':pending': { S: 'PENDING' } },
        ProjectionExpression: 'referredIdentityId, appliedAt',
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      }),
    );
    for (const item of res.Items || []) {
      const id = item.referredIdentityId?.S;
      if (id) {
        out.push({
          referredIdentityId: id,
          appliedAt: item.appliedAt?.S || null,
        });
      }
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

async function distinctActiveDays(identityId: string): Promise<number> {
  const rows = await pg`
    SELECT COUNT(DISTINCT (tx_timestamp AT TIME ZONE 'UTC')::date)::int AS days
    FROM activity_points
    WHERE identity_id = ${identityId}
      AND NOT flagged
      AND category <> 'referral-bonus'
  `;
  return rows[0]?.days || 0;
}

async function activate(identityId: string): Promise<'activated' | 'skipped' | 'error'> {
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: REFERRALS_TABLE,
        Key: { referredIdentityId: { S: identityId } },
        UpdateExpression:
          'SET #s = :activated, activatedAt = :now, reviewedAt = :now, reviewerIdentityId = :system',
        ConditionExpression: 'attribute_exists(referredIdentityId) AND #s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':activated': { S: 'ACTIVATED' },
          ':pending': { S: 'PENDING' },
          ':now': { S: now },
          ':system': { S: 'system:migrate-existing-pending-referrals' },
        },
      }),
    );
    return 'activated';
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') return 'skipped';
    console.error(`[migrate] Activate failed for ${identityId}:`, err.message);
    return 'error';
  }
}

async function main() {
  console.log(`[migrate] Mode: ${EXECUTE ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`[migrate] Scanning ${REFERRALS_TABLE} for PENDING rows...`);
  const pending = await scanPending();
  console.log(`[migrate] Found ${pending.length} PENDING rows`);

  const cutoffMs = Date.now() - MIN_APPLIED_AGE_DAYS * 24 * 60 * 60 * 1000;
  const candidates: { id: string; appliedAt: string; days: number }[] = [];
  let skippedRecent = 0;

  for (const row of pending) {
    if (!row.appliedAt) {
      // Legacy row without appliedAt — be conservative, skip.
      skippedRecent++;
      continue;
    }
    const appliedMs = Date.parse(row.appliedAt);
    if (!Number.isFinite(appliedMs) || appliedMs > cutoffMs) {
      // Too recent — let admin review them under the new flow.
      skippedRecent++;
      continue;
    }
    const days = await distinctActiveDays(row.referredIdentityId);
    if (days >= MIN_DISTINCT_DAYS) {
      candidates.push({ id: row.referredIdentityId, appliedAt: row.appliedAt, days });
    }
  }

  console.log(
    `[migrate] Candidates: ${candidates.length} (>= ${MIN_DISTINCT_DAYS}d activity, applied > ${MIN_APPLIED_AGE_DAYS}d ago)`,
  );
  console.log(`[migrate] Skipped (too recent or no appliedAt): ${skippedRecent}`);

  if (!EXECUTE) {
    for (const c of candidates.slice(0, 20)) {
      console.log(`  - ${c.id} (appliedAt=${c.appliedAt}, days=${c.days})`);
    }
    if (candidates.length > 20) console.log(`  ... and ${candidates.length - 20} more`);
    console.log('[migrate] DRY RUN complete. Re-run with --execute to apply.');
    await pg.end();
    return;
  }

  let activated = 0;
  let skipped = 0;
  let errors = 0;
  for (const c of candidates) {
    const result = await activate(c.id);
    if (result === 'activated') activated++;
    else if (result === 'skipped') skipped++;
    else errors++;
  }
  console.log(
    `[migrate] Done. activated=${activated} skipped=${skipped} errors=${errors}`,
  );
  await pg.end();
}

main().catch((err) => {
  console.error('[migrate] Fatal:', err);
  process.exit(1);
});
