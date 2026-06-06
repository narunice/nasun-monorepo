/**
 * Wallet Points Migration (additive)
 *
 * Re-homes a user's earned activity points from an abandoned wallet (FROM) to
 * their current wallet (TO) when they have lost access to the FROM wallet and
 * recovered ownership via social re-link. The points ledger is INSERT-only
 * (points-integrity-guard.sql blocks UPDATE/DELETE), so migration is done by
 * appending a single compensating credit row on the TO wallet equal to the
 * FROM wallet's current non-flagged point total. The FROM rows are left
 * untouched (additive policy): the FROM wallet is a dormant identity and its
 * leaderboard payout is effectively zero, so the residual double-count carries
 * no practical impact, while append-only keeps the monotone-up invariant intact
 * (TO all-time strictly increases).
 *
 * Idempotency: tx_digest = wallet-migrate:{fromIdentity}->{toIdentity}
 * The UNIQUE(tx_digest, activity_type, event_seq) constraint makes re-runs
 * no-ops.
 *
 * Amount: computed at runtime as SUM(final_points) over the FROM wallet's
 * non-flagged rows, so the credit always mirrors the live FROM balance shown
 * in my-account. Pass --max-pts to assert an upper bound (safety guard).
 *
 * Usage (run on node-3 where the points DB lives):
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/grant-wallet-migration.ts \
 *     --from-wallet 0x... --to-wallet 0x... --to-identity ap-northeast-2:... \
 *     [--from-identity ap-northeast-2:...] [--max-pts 80] --dry-run
 *   # then re-run with --execute to apply
 */

import postgres from 'postgres';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const dryRun = !args.includes('--execute');
const fromWallet = (getArg('from-wallet') || '').toLowerCase();
const toWallet = (getArg('to-wallet') || '').toLowerCase();
const toIdentity = getArg('to-identity') || '';
const fromIdentity = getArg('from-identity') || '';
const maxPts = getArg('max-pts') ? parseFloat(getArg('max-pts')!) : undefined;

const ADDR_RE = /^0x[a-f0-9]{64}$/;
const ID_RE = /^[a-z]{2}-[a-z]+-\d:[0-9a-f-]{36}$/;

if (!ADDR_RE.test(fromWallet) || !ADDR_RE.test(toWallet)) {
  console.error('--from-wallet and --to-wallet must be 0x + 64 hex');
  process.exit(1);
}
if (!ID_RE.test(toIdentity)) {
  console.error('--to-identity must be a Cognito identityId (region:uuid)');
  process.exit(1);
}
if (fromWallet === toWallet) {
  console.error('from and to wallets are identical; nothing to migrate');
  process.exit(1);
}

const CATEGORY = 'ecosystem-bonus-wallet-migration';
const ACTIVITY_TYPE = 'wallet-migration';

const db = postgres(POINTS_DB_URL, { max: 2, idle_timeout: 30, connect_timeout: 10 });

async function sumNonFlagged(wallet: string): Promise<number> {
  const rows = await db<{ s: string }[]>`
    SELECT COALESCE(SUM(final_points), 0)::text AS s
    FROM activity_points
    WHERE LOWER(wallet_address) = ${wallet} AND NOT flagged
  `;
  return parseFloat(rows[0].s);
}

async function resolveIdentity(wallet: string): Promise<string | null> {
  const rows = await db<{ identity_id: string | null }[]>`
    SELECT identity_id FROM activity_points
    WHERE LOWER(wallet_address) = ${wallet} AND identity_id IS NOT NULL
    ORDER BY processed_at DESC LIMIT 1
  `;
  return rows[0]?.identity_id ?? null;
}

async function main() {
  console.log(`\n=== Wallet Points Migration (${dryRun ? 'DRY RUN' : 'LIVE'}) ===`);
  console.log(`  FROM wallet : ${fromWallet}`);
  console.log(`  TO   wallet : ${toWallet}`);
  console.log(`  TO identity : ${toIdentity}`);

  const resolvedFromId = fromIdentity || (await resolveIdentity(fromWallet));
  if (!resolvedFromId) {
    console.error('Could not resolve FROM identity (no rows / null identity). Pass --from-identity.');
    await db.end();
    process.exit(1);
  }
  console.log(`  FROM identity: ${resolvedFromId}`);

  const fromSum = await sumNonFlagged(fromWallet);
  const toBefore = await sumNonFlagged(toWallet);
  console.log(`\n  FROM non-flagged total: ${fromSum.toFixed(2)} pts`);
  console.log(`  TO   current total    : ${toBefore.toFixed(2)} pts`);

  if (fromSum <= 0) {
    console.error('\nFROM wallet has no non-flagged points to migrate. Aborting.');
    await db.end();
    process.exit(1);
  }
  if (maxPts !== undefined && fromSum > maxPts + 0.001) {
    console.error(`\nFROM total ${fromSum.toFixed(2)} exceeds --max-pts ${maxPts}. Aborting (safety guard).`);
    await db.end();
    process.exit(1);
  }

  const migratePts = fromSum;
  const digest = `wallet-migrate:${resolvedFromId}->${toIdentity}`;
  console.log(`\n  Planned credit row:`);
  console.log(`    wallet_address : ${toWallet}`);
  console.log(`    identity_id    : ${toIdentity}`);
  console.log(`    category       : ${CATEGORY}`);
  console.log(`    activity_type  : ${ACTIVITY_TYPE}`);
  console.log(`    final_points   : ${migratePts.toFixed(2)}`);
  console.log(`    tx_digest      : ${digest}`);
  console.log(`\n  TO total after : ${(toBefore + migratePts).toFixed(2)} pts (was ${toBefore.toFixed(2)})`);

  if (dryRun) {
    console.log(`\n  Mode: DRY RUN — re-run with --execute to apply.`);
    await db.end();
    return;
  }

  const metadata = {
    reason: 'wallet-migration',
    from_wallet: fromWallet,
    from_identity: resolvedFromId,
    migrated_from_total: migratePts,
  };

  const result = await db`
    INSERT INTO activity_points
      (wallet_address, identity_id, tx_digest, category, activity_type,
       base_points, volume_tier, genesis_multiplier, final_points,
       tx_timestamp, event_seq, tx_sequence_number, metadata)
    VALUES
      (${toWallet}, ${toIdentity}, ${digest}, ${CATEGORY}, ${ACTIVITY_TYPE},
       ${migratePts}, 1.0, 1.0, ${migratePts.toFixed(2)},
       NOW()::timestamptz, 0, 0, ${db.json(metadata)})
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  if (result.count > 0) {
    const toAfter = await sumNonFlagged(toWallet);
    console.log(`\n  INSERTED. TO total now: ${toAfter.toFixed(2)} pts`);
  } else {
    console.log(`\n  No-op (already migrated; tx_digest exists).`);
  }

  await db.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
