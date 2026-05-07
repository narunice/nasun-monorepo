/**
 * One-shot migration: legacy UserProfiles.isAccountFlagged → banned_users.
 *
 * Background: the original "Account Flag" feature only excluded users from
 * the April 16 airdrop. Bot mitigation now lives in banned_users +
 * activity_points.flagged on the points DB. This script copies any
 * remaining flagged users into the new ban system so we can decommission
 * the flag Lambda + UserProfiles flag fields without losing context.
 *
 * What it does:
 *   1. Scans UserProfiles for isAccountFlagged=true.
 *   2. For each, resolves walletAddress (top-level OR linkedAccounts['nasun wallet']).
 *      Users without a nasun wallet are skipped (legacy, no ecosystem activity).
 *   3. Calls the same applyBans() the admin UI and CLI use, with
 *      bannedBy = "migration-flag-to-ban-<date>" and reason copied from
 *      flagReason (prefixed "[migrated-from-flag]").
 *   4. activity_points.flagged is updated by applyBans inside the same tx.
 *   5. chat-server cache is refreshed once at the end.
 *
 * What it does NOT do:
 *   - It does NOT clear UserProfiles.isAccountFlagged*. Those fields
 *     stay so we can re-run safely; final cleanup happens in Phase 4
 *     when the flag Lambda + routes are removed.
 *
 * Idempotent: the banned_users upsert keys on identity_id, so re-running
 * is a no-op except for refreshing banned_at / banned_by.
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   set -a && source .env && set +a
 *
 *   # Dry-run (default; lists targets, no writes)
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/migrate-flagged-to-banned.ts
 *
 *   # Apply
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/migrate-flagged-to-banned.ts --execute
 */

import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  applyBans,
  refreshChatServerCache,
  type Resolution,
} from '../services/ban-service.js';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const execute = process.argv.includes('--execute');
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const ACTOR = `migration-flag-to-ban-${today}`;

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

interface FlaggedUserRow {
  identityId: string;
  twitterHandle?: string;
  walletAddress?: string;
  flagReason?: string;
  flaggedAt?: string;
  flaggedBy?: string;
  linkedAccounts?: Record<string, { identityId?: string; walletAddress?: string }>;
}

async function scanFlaggedUsers(): Promise<FlaggedUserRow[]> {
  const out: FlaggedUserRow[] = [];
  let cursor: Record<string, unknown> | undefined;
  let pages = 0;
  do {
    const r = await ddb.send(
      new ScanCommand({
        TableName: USER_PROFILES_TABLE,
        FilterExpression: 'isAccountFlagged = :t',
        ExpressionAttributeValues: { ':t': true },
        Limit: 1000,
        ExclusiveStartKey: cursor,
      }),
    );
    if (r.Items) out.push(...(r.Items as FlaggedUserRow[]));
    cursor = r.LastEvaluatedKey;
    pages += 1;
    if (pages > 200) {
      console.warn('[warn] scan budget exceeded (200 pages)');
      break;
    }
  } while (cursor);
  return out;
}

interface MigrationTarget {
  identityId: string;
  walletAddress?: string;
  twitterHandle?: string;
  flagReason: string;
  flaggedAt?: string;
  flaggedBy?: string;
  source: 'primary' | 'linked-nasun-wallet';
}

async function expandToBanTargets(row: FlaggedUserRow): Promise<MigrationTarget[]> {
  // Mirror resolveBanTargets from ban-service: ban primary + linked nasun wallet.
  const targets: MigrationTarget[] = [];
  const flagReason = row.flagReason || 'flagged';
  const reason = `[migrated-from-flag] ${flagReason}`;

  let walletAddress = row.walletAddress?.toLowerCase();
  if (!walletAddress) {
    walletAddress = row.linkedAccounts?.['nasun wallet']?.walletAddress?.toLowerCase();
  }

  targets.push({
    identityId: row.identityId,
    walletAddress,
    twitterHandle: row.twitterHandle,
    flagReason: reason,
    flaggedAt: row.flaggedAt,
    flaggedBy: row.flaggedBy,
    source: 'primary',
  });

  // If the row's nasun-wallet sub-identity is a separate UserProfiles record,
  // also ban that identity so the user can't switch login methods to evade.
  const linkedNasun = row.linkedAccounts?.['nasun wallet'];
  if (linkedNasun?.identityId && linkedNasun.identityId !== row.identityId) {
    // Hydrate the linked record to confirm it exists (best-effort).
    try {
      const r = await ddb.send(
        new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: linkedNasun.identityId } }),
      );
      if (r.Item) {
        targets.push({
          identityId: linkedNasun.identityId,
          walletAddress: linkedNasun.walletAddress?.toLowerCase() || walletAddress,
          twitterHandle: row.twitterHandle,
          flagReason: reason,
          flaggedAt: row.flaggedAt,
          flaggedBy: row.flaggedBy,
          source: 'linked-nasun-wallet',
        });
      }
    } catch (_) { /* best-effort */ }
  }

  return targets;
}

function targetsToResolutions(targets: MigrationTarget[]): Resolution[] {
  return targets.map((t) => ({
    handle: t.twitterHandle || '',
    identityId: t.identityId,
    walletAddress: t.walletAddress,
    status: t.walletAddress ? 'mapped' : 'no-wallet',
    note: t.source,
  }));
}

async function main() {
  console.log(`\n=== Flag → Ban migration ${execute ? 'EXECUTE' : 'DRY-RUN'} ===`);
  console.log(`Actor: ${ACTOR}`);

  const flagged = await scanFlaggedUsers();
  console.log(`\nFlagged users found: ${flagged.length}`);
  if (flagged.length === 0) {
    console.log('Nothing to migrate.');
    await db.end();
    return;
  }

  const allTargets: MigrationTarget[] = [];
  for (const row of flagged) {
    const ts = await expandToBanTargets(row);
    allTargets.push(...ts);
  }

  console.log('\nResolution table:');
  console.log('  source                 identityId                                    handle              wallet                                                              reason');
  for (const t of allTargets) {
    const wallet = t.walletAddress || '(no wallet)';
    const handle = t.twitterHandle ? '@' + t.twitterHandle : '-';
    console.log(
      `  ${t.source.padEnd(22)} ${t.identityId.padEnd(45)} ${handle.padEnd(18)} ${wallet.padEnd(66)} ${t.flagReason}`,
    );
  }

  const noWallet = allTargets.filter((t) => !t.walletAddress);
  if (noWallet.length > 0) {
    console.log(
      `\n${noWallet.length} target(s) without a wallet — these will be banned by identityId only (legacy / no nasun wallet).`,
    );
  }

  // Group by reason so applyBans gets one reason per group. Easiest: one-by-one.
  if (!execute) {
    console.log('\nDry-run complete. Re-run with --execute to apply.');
    await db.end();
    return;
  }

  console.log(`\nApplying ${allTargets.length} ban(s)...`);
  let totalFlaggedRows = 0;
  for (const t of allTargets) {
    const resolutions = targetsToResolutions([t]);
    const result = await applyBans(db, resolutions, t.flagReason, ACTOR);
    for (const r of result) {
      totalFlaggedRows += r.flaggedRows;
      console.log(
        `  ${t.source} → ${r.identityId} (${r.handle || '-'}): flagged ${r.flaggedRows} activity rows`,
      );
    }
  }
  console.log(`\nTotal activity_points rows flagged: ${totalFlaggedRows}`);

  console.log('\nRefreshing chat-server banned cache...');
  const refresh = await refreshChatServerCache();
  if (refresh.ok) console.log('  [ok] chat-server refreshed');
  else if (refresh.error?.includes('not set')) console.log(`  [skip] ${refresh.error} — TTL fallback (5 min)`);
  else if (refresh.status) console.warn(`  [warn] chat-server refresh returned ${refresh.status}`);
  else console.warn(`  [warn] chat-server refresh failed: ${refresh.error}`);

  await db.end();
  console.log('\nDone.');
  console.log('Note: UserProfiles.isAccountFlagged* is intentionally left in place.');
  console.log('Phase 4 will remove those fields when the flag Lambda is decommissioned.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
