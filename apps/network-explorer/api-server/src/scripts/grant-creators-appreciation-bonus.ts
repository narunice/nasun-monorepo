/**
 * Creators Appreciation Bonus
 *
 * One-time bonus of 60 ecosystem points to Top 500 creators of
 * Community Leaderboard v3 Season 1 (snapshot 2026-04-09), as a
 * gesture of apology for the leaderboard halt and gratitude for
 * their contributions.
 *
 * Source of truth:
 *   - Recipients: backup JSON at _backup/leaderboard-v3-snapshots/2026-04-12/by-date/2026-04-09.json
 *   - Identity mapping: live DynamoDB UserProfiles (twitterHandle-index GSI + GetItem)
 *
 * Idempotent via tx_digest UNIQUE constraint.
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   set -a && source .env && set +a
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-creators-appreciation-bonus.ts
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-creators-appreciation-bonus.ts --execute
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const SNAPSHOT_PATH = resolve(
  process.cwd(),
  '../../../_backup/leaderboard-v3-snapshots/2026-04-12/by-date/2026-04-09.json',
);
const MISSES_OUT = resolve(
  process.cwd(),
  '../../../_backup/creators-appreciation-bonus-misses.csv',
);
const TOP_N = 500;
const BONUS_POINTS = 60;
const SNAPSHOT_DATE_ISO = '2026-04-09T00:00:00Z';

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const execute = process.argv.includes('--execute');
const exportEligibility = process.argv.includes('--export-eligibility');
const dryRun = !execute && !exportEligibility;
const ELIGIBILITY_OUT = resolve(
  process.cwd(),
  '../../../_backup/creators-appreciation-eligibility.json',
);

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

interface SnapshotItem {
  sk: string;
  rank: number;
  username: string;
  originalUsername?: string;
  accountId: string;
}

interface UserProfileRecord {
  identityId: string;
  username?: string;
  twitterHandle?: string;
  walletAddress?: string;
}

interface MappingResult {
  rank: number;
  handle: string;
  originalHandle: string;
  accountId: string;
  primaryIdentityId?: string; // The cognito identity that owns the X handle (JWT match key).
  targetIdentityId?: string; // The cognito identity to INSERT activity_points for (= primary for top-level, = linked nasun wallet for linked).
  targetWalletAddress?: string;
  walletSource?: 'top-level' | 'linked-nasun-wallet';
  status: 'mapped' | 'missing' | 'no-wallet' | 'invalid-handle' | 'lookup-error';
  note?: string;
}

interface LinkedAccountInfo {
  identityId?: string;
  walletAddress?: string;
}

interface FullProfile {
  identityId: string;
  walletAddress?: string;
  linkedAccounts?: Record<string, LinkedAccountInfo>;
}

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim();
}

function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(handle);
}

function isValidSuiAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(addr);
}

/**
 * Query UserProfiles.twitterHandle-index and pick the best matching profile.
 * Mirrors lookupUserProfile() from leaderboard-v3 dynamodb-client.ts:671,
 * but returns identityId so we can chain a GetItem for walletAddress.
 */
async function lookupIdentityByHandle(handle: string): Promise<string | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'twitterHandle-index',
      KeyConditionExpression: 'twitterHandle = :handle',
      ExpressionAttributeValues: { ':handle': handle },
    }),
  );

  if (!result.Items || result.Items.length === 0) return null;

  // Prefer profile whose username is not a wallet address (multi-profile case).
  let best = result.Items[0] as UserProfileRecord;
  for (const it of result.Items) {
    const p = it as UserProfileRecord;
    if (p.username && !p.username.startsWith('0x')) {
      best = p;
      break;
    }
  }
  return best.identityId;
}

/**
 * Resolve the disbursement target for a profile.
 *
 * Priority:
 *   1. Top-level walletAddress (Nasun-wallet-primary signups)
 *   2. linkedAccounts['nasun wallet'].{identityId, walletAddress}
 *      (Twitter-primary users who later linked a Nasun wallet)
 *
 * The linked Nasun wallet has its own cognito identity where Sui
 * on-chain activity (and ecosystem points) accumulate, so awarding
 * there ensures the bonus aggregates with the user's actual activity.
 *
 * Returns null when no Nasun wallet is found (e.g., user deleted their
 * linked wallet during the period the unlink button was available).
 */
async function resolveDisbursementTarget(
  primaryIdentityId: string,
): Promise<{ identityId: string; walletAddress: string; source: 'top-level' | 'linked-nasun-wallet' } | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId: primaryIdentityId },
    }),
  );
  const profile = result.Item as FullProfile | undefined;
  if (!profile) return null;

  if (profile.walletAddress) {
    return {
      identityId: primaryIdentityId,
      walletAddress: profile.walletAddress.toLowerCase(),
      source: 'top-level',
    };
  }

  const nasunLink = profile.linkedAccounts?.['nasun wallet'];
  if (nasunLink?.identityId && nasunLink.walletAddress) {
    return {
      identityId: nasunLink.identityId,
      walletAddress: nasunLink.walletAddress.toLowerCase(),
      source: 'linked-nasun-wallet',
    };
  }

  return null;
}

async function main() {
  console.log(`\n=== Creators Appreciation Bonus (${dryRun ? 'DRY RUN' : 'LIVE EXECUTE'}) ===`);
  console.log(`  Snapshot: 2026-04-09, Top ${TOP_N}, ${BONUS_POINTS}pt each`);
  console.log(`  Source: ${SNAPSHOT_PATH}\n`);

  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as {
    pk: string;
    count: number;
    items: SnapshotItem[];
  };

  const sorted = [...snapshot.items].sort((a, b) => a.sk.localeCompare(b.sk));
  const top = sorted.slice(0, TOP_N);
  console.log(`  Loaded ${top.length} of ${snapshot.count} from snapshot ${snapshot.pk}\n`);

  console.log('Mapping handles to identities...');
  const results: MappingResult[] = [];
  for (let i = 0; i < top.length; i++) {
    const item = top[i];
    const original = item.originalUsername || item.username;
    const handle = normalizeHandle(item.username);

    const base: MappingResult = {
      rank: item.rank,
      handle,
      originalHandle: original,
      accountId: item.accountId,
      status: 'missing',
    };

    if (!isValidHandle(handle)) {
      results.push({ ...base, status: 'invalid-handle', note: `raw='${item.username}'` });
      continue;
    }

    try {
      const primaryIdentityId = await lookupIdentityByHandle(handle);
      if (!primaryIdentityId) {
        results.push(base);
        continue;
      }

      const target = await resolveDisbursementTarget(primaryIdentityId);
      if (!target) {
        results.push({
          ...base,
          primaryIdentityId,
          status: 'no-wallet',
          note: 'no nasun wallet (possibly unlinked)',
        });
        continue;
      }

      if (!isValidSuiAddress(target.walletAddress)) {
        results.push({
          ...base,
          primaryIdentityId,
          targetIdentityId: target.identityId,
          status: 'no-wallet',
          note: `invalid sui address format: ${target.walletAddress}`,
        });
        continue;
      }

      results.push({
        ...base,
        primaryIdentityId,
        targetIdentityId: target.identityId,
        targetWalletAddress: target.walletAddress,
        walletSource: target.source,
        status: 'mapped',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ ...base, status: 'lookup-error', note: msg });
    }

    if ((i + 1) % 50 === 0) {
      process.stdout.write(`  ${i + 1}/${top.length}\r`);
    }
  }
  console.log(`  ${top.length}/${top.length} done\n`);

  const mapped = results.filter((r) => r.status === 'mapped');
  const missing = results.filter((r) => r.status === 'missing');
  const noWallet = results.filter((r) => r.status === 'no-wallet');
  const invalid = results.filter((r) => r.status === 'invalid-handle');
  const lookupErrors = results.filter((r) => r.status === 'lookup-error');

  const mappedTopLevel = mapped.filter((r) => r.walletSource === 'top-level').length;
  const mappedLinked = mapped.filter((r) => r.walletSource === 'linked-nasun-wallet').length;

  console.log('--- Mapping Summary ---');
  console.log(`  Mapped (eligible):     ${mapped.length}`);
  console.log(`    via top-level wallet:        ${mappedTopLevel}`);
  console.log(`    via linked nasun wallet:     ${mappedLinked}`);
  console.log(`  Missing (no profile):  ${missing.length}`);
  console.log(`  No wallet (unlinked?): ${noWallet.length}`);
  console.log(`  Invalid handle format: ${invalid.length}`);
  console.log(`  Lookup errors:         ${lookupErrors.length}`);
  console.log(`  Total bonus to award:  ${mapped.length * BONUS_POINTS} pts\n`);

  // Write misses CSV (always, so user can review even on dry-run).
  // CSV values are quoted so commas/newlines/quotes in notes don't corrupt it.
  const allMisses = [...missing, ...noWallet, ...invalid, ...lookupErrors];
  if (allMisses.length > 0) {
    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csvRows = ['rank,handle,originalHandle,accountId,status,primaryIdentityId,note'];
    const sortedMisses = [...allMisses].sort((a, b) => a.rank - b.rank);
    for (const r of sortedMisses) {
      csvRows.push(
        [r.rank, r.handle, r.originalHandle, r.accountId, r.status, r.primaryIdentityId ?? '', r.note ?? '']
          .map(csvEscape)
          .join(','),
      );
    }
    writeFileSync(MISSES_OUT, csvRows.join('\n'));
    console.log(`  Misses CSV: ${MISSES_OUT}\n`);
  }

  if (exportEligibility) {
    const eligibility = {
      bonusName: 'Creators Appreciation Bonus',
      category: 'ecosystem-bonus-creators-appreciation',
      activityType: 'season1-top500',
      bonusPoints: BONUS_POINTS,
      snapshotDate: SNAPSHOT_DATE_ISO,
      generatedAt: new Date().toISOString(),
      entries: mapped.map((r) => ({
        rank: r.rank,
        handle: r.handle,
        originalHandle: r.originalHandle,
        accountId: r.accountId,
        primaryIdentityId: r.primaryIdentityId!,
        targetIdentityId: r.targetIdentityId!,
        targetWalletAddress: r.targetWalletAddress!,
        walletSource: r.walletSource!,
      })),
    };
    writeFileSync(ELIGIBILITY_OUT, JSON.stringify(eligibility, null, 2));
    console.log(`Eligibility JSON: ${ELIGIBILITY_OUT}`);
    console.log(`  ${eligibility.entries.length} entries written`);
    await db.end();
    ddb.destroy();
    return;
  }

  if (dryRun) {
    console.log('DRY RUN — no DB writes performed.');
    console.log('Re-run with --execute to apply the bonus.');
    await db.end();
    ddb.destroy();
    return;
  }

  console.log('--- Inserting into activity_points ---');
  let inserted = 0;
  let skipped = 0;
  let totalPts = 0;

  for (const r of mapped) {
    const digest = `bonus-creators-appreciation:season1:${r.targetIdentityId}:${r.handle}`;
    const result = await db`
      INSERT INTO activity_points
        (wallet_address, identity_id, tx_digest, category, activity_type,
         base_points, volume_tier, genesis_multiplier, final_points,
         tx_timestamp, event_seq, tx_sequence_number)
      VALUES
        (${r.targetWalletAddress!}, ${r.targetIdentityId!}, ${digest},
         'ecosystem-bonus-creators-appreciation', 'season1-top500',
         ${BONUS_POINTS}, 1.0, 1.0, ${BONUS_POINTS},
         NOW()::timestamptz, 0, 0)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    if (result.count > 0) {
      inserted++;
      totalPts += BONUS_POINTS;
    } else {
      skipped++;
    }
  }

  console.log(`\n--- Execute Summary ---`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (already applied): ${skipped}`);
  console.log(`  Total points awarded: ${totalPts.toLocaleString()}`);

  await db.end();
  await ddb.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
