/**
 * Retroactive Bug Report Bonus
 *
 * Grants bug report bonus points to users who reported bugs BEFORE the
 * in-app bug report system ([bug-report-admin Lambda] + [points.ts
 * /bug-report-reward]) shipped. Uses the existing `ecosystem-bonus-bugreport`
 * category so these points aggregate into the same bar segment as
 * post-system rewards.
 *
 * Identity resolution mirrors grant-creators-appreciation-bonus.ts:
 *   - Query UserProfiles.twitterHandle-index (handle → primary identity)
 *   - Resolve disbursement target: top-level wallet first, else linked
 *     'nasun wallet' (so Sui activity and ecosystem points accrue to the
 *     same identity).
 *
 * Idempotency: activity_points UNIQUE(tx_digest, activity_type, event_seq)
 *   tx_digest = bugreport:retroactive-{handle}
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   set -a && source .env && set +a
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-retroactive-bugreport-bonus.ts
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/grant-retroactive-bugreport-bonus.ts --execute
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const MISSES_OUT = resolve(
  process.cwd(),
  '../../../_backup/retroactive-bugreport-bonus-misses.csv',
);

const CATEGORY = 'ecosystem-bonus-bugreport';
const ACTIVITY_TYPE = 'report-accepted';

interface Recipient {
  handle: string;
  points: number;
}

// Source: user-provided list of pre-system bug reporters.
// Points reflect report severity / usefulness, per admin judgment.
const RECIPIENTS: readonly Recipient[] = [
  { handle: 'iam_aesir', points: 5 },
  { handle: 'trungvu_dtv', points: 8 },
  { handle: 'jeongseonmun2', points: 10 },
  { handle: 'Reborn_M0D', points: 12 },
  { handle: 'D33n_web3', points: 15 },
  { handle: 'ausbro80', points: 10 },
  { handle: 'thejediworld77', points: 10 },
  { handle: 'igangsan54078', points: 4 },
  { handle: 'ccboomer_', points: 12 },
  { handle: 'Luongson94', points: 10 },
  { handle: 'hyonggoo93', points: 8 },
  { handle: 'bliss_rh', points: 10 },
  { handle: 'Sumon4447s', points: 8 },
  { handle: 'kangtaehong88', points: 8 },
  { handle: 'spiral_xx', points: 8 },
  { handle: 'baegseungh7061', points: 15 },
  { handle: 'Diamondcryptx', points: 6 },
  { handle: 'Shillawakning', points: 10 },
  { handle: 'edyjayakarya', points: 14 },
  { handle: 'metallover92', points: 6 },
  { handle: '0x_reggie', points: 5 },
  { handle: 'NjokuNzubewisd1', points: 5 },
  { handle: 'crypton11te', points: 5 },
  { handle: 'Amenouboy', points: 5 },
  { handle: 'kieu20011', points: 5 },
  { handle: 'Sammysea09', points: 5 },
  { handle: 'Dennis946977517', points: 8 },
];

// Integrity check — catches accidental list edits.
const EXPECTED_COUNT = 27;
const EXPECTED_TOTAL_POINTS = RECIPIENTS.reduce((s, r) => s + r.points, 0);

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

if (RECIPIENTS.length !== EXPECTED_COUNT) {
  console.error(
    `Recipient list size mismatch: got ${RECIPIENTS.length}, expected ${EXPECTED_COUNT}. ` +
    `Update EXPECTED_COUNT if the edit is intentional.`,
  );
  process.exit(1);
}

const execute = process.argv.includes('--execute');
const dryRun = !execute;

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

interface UserProfileRecord {
  identityId: string;
  username?: string;
  twitterHandle?: string;
  walletAddress?: string;
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

interface MappingResult {
  handle: string;
  originalHandle: string;
  points: number;
  primaryIdentityId?: string;
  targetIdentityId?: string;
  targetWalletAddress?: string;
  walletSource?: 'top-level' | 'linked-nasun-wallet';
  status: 'mapped' | 'missing' | 'no-wallet' | 'invalid-handle' | 'lookup-error';
  note?: string;
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
  console.log(`\n=== Retroactive Bug Report Bonus (${dryRun ? 'DRY RUN' : 'LIVE EXECUTE'}) ===`);
  console.log(`  Recipients: ${RECIPIENTS.length}, expected total points: ${EXPECTED_TOTAL_POINTS}\n`);

  console.log('Mapping handles to identities...');
  const results: MappingResult[] = [];

  for (const r of RECIPIENTS) {
    const handle = normalizeHandle(r.handle);
    const base: MappingResult = {
      handle,
      originalHandle: r.handle,
      points: r.points,
      status: 'missing',
    };

    if (!isValidHandle(handle)) {
      results.push({ ...base, status: 'invalid-handle', note: `raw='${r.handle}'` });
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
  }

  const mapped = results.filter((r) => r.status === 'mapped');
  const missing = results.filter((r) => r.status === 'missing');
  const noWallet = results.filter((r) => r.status === 'no-wallet');
  const invalid = results.filter((r) => r.status === 'invalid-handle');
  const lookupErrors = results.filter((r) => r.status === 'lookup-error');

  const mappedPts = mapped.reduce((s, r) => s + r.points, 0);
  const mappedTopLevel = mapped.filter((r) => r.walletSource === 'top-level').length;
  const mappedLinked = mapped.filter((r) => r.walletSource === 'linked-nasun-wallet').length;

  console.log('\n--- Mapping Summary ---');
  console.log(`  Mapped (eligible):     ${mapped.length} (${mappedPts} pts)`);
  console.log(`    via top-level wallet:        ${mappedTopLevel}`);
  console.log(`    via linked nasun wallet:     ${mappedLinked}`);
  console.log(`  Missing (no profile):  ${missing.length}`);
  console.log(`  No wallet (unlinked?): ${noWallet.length}`);
  console.log(`  Invalid handle format: ${invalid.length}`);
  console.log(`  Lookup errors:         ${lookupErrors.length}`);

  // Print per-recipient table for operator review.
  console.log('\n--- Per-Recipient Detail ---');
  for (const r of results) {
    const tag = r.status === 'mapped' ? 'OK ' : '-- ';
    const walletFragment = r.targetWalletAddress
      ? `${r.targetWalletAddress.slice(0, 10)}...${r.targetWalletAddress.slice(-4)}`
      : (r.note || r.status);
    console.log(
      `  ${tag} @${r.originalHandle.padEnd(18)} ${String(r.points).padStart(3)}pt  ${walletFragment}`,
    );
  }

  const allMisses = [...missing, ...noWallet, ...invalid, ...lookupErrors];
  if (allMisses.length > 0) {
    const csvEscape = (v: unknown) => {
      const s = String(v ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csvRows = ['handle,originalHandle,points,status,primaryIdentityId,note'];
    for (const r of allMisses) {
      csvRows.push(
        [r.handle, r.originalHandle, r.points, r.status, r.primaryIdentityId ?? '', r.note ?? '']
          .map(csvEscape)
          .join(','),
      );
    }
    writeFileSync(MISSES_OUT, csvRows.join('\n'));
    console.log(`\n  Misses CSV: ${MISSES_OUT}`);
  }

  if (dryRun) {
    console.log('\nDRY RUN — no DB writes performed.');
    console.log('Re-run with --execute to apply the bonus.');
    await db.end();
    ddb.destroy();
    return;
  }

  console.log('\n--- Inserting into activity_points ---');
  let inserted = 0;
  let skipped = 0;
  let totalPts = 0;

  for (const r of mapped) {
    const digest = `bugreport:retroactive-${r.handle}`;
    const result = await db`
      INSERT INTO activity_points
        (wallet_address, identity_id, tx_digest, category, activity_type,
         base_points, volume_tier, genesis_multiplier, final_points,
         tx_timestamp, event_seq, tx_sequence_number)
      VALUES
        (${r.targetWalletAddress!}, ${r.targetIdentityId!}, ${digest},
         ${CATEGORY}, ${ACTIVITY_TYPE},
         ${r.points}, 1.0, 1.0, ${r.points},
         NOW()::timestamptz, 0, 0)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    if (result.count > 0) {
      inserted++;
      totalPts += r.points;
    } else {
      skipped++;
    }
  }

  console.log(`\n--- Execute Summary ---`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (already applied): ${skipped}`);
  console.log(`  Total points awarded: ${totalPts}`);

  await db.end();
  await ddb.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
