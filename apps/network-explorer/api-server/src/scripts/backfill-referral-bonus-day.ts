/**
 * Backfill missing daily referral bonus rows.
 *
 * The `runDailyReferralBonus` batch normally fires inside scanLoop after
 * `takeDailySnapshot` succeeds. When the snapshot is blocked (e.g. by a
 * missing-health-row fail-safe) or the referral feature was deployed after
 * the snapshot already lockedin, the batch never runs for that date and
 * every referrer in the system loses their 10% share of referee activity.
 *
 * This script re-runs the same batch standalone. Idempotent: rows already
 * present (matching `tx_digest` + `activity_type` + `event_seq`) are
 * skipped via ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   node dist/scripts/backfill-referral-bonus-day.js --date 2026-05-17
 *   node dist/scripts/backfill-referral-bonus-day.js --date 2026-05-17 --date 2026-05-18
 *
 * Required env: POINTS_DATABASE_URL, REFERRAL_MAPPINGS_URL,
 * REFERRAL_MAPPINGS_API_KEY (optional), WALLET_MAPPINGS_URL,
 * WALLET_MAPPINGS_API_KEY (optional), REFERRAL_REWARD_ENABLED=true.
 */

import { pointsDb } from '../db.js';
import {
  maybeRefreshReferralCache,
  updateIdentityToWalletMap,
  getReferralCache,
  getIdentityToWalletMap,
} from '../scanner/referral-bonus.js';
import { runDailyReferralBonus } from '../scanner/daily-referral-bonus.js';
import { REFERRAL_REWARD_ENABLED } from '../config/referral.js';
import { fetchWithOffload } from '../scanner/fetch-with-offload.js';

function parseArgs(): string[] {
  const dates: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--date' && args[i + 1]) {
      dates.push(args[++i]);
    } else if (a.startsWith('--date=')) {
      dates.push(a.slice('--date='.length));
    }
  }
  return dates;
}

async function fetchRegisteredWallets(): Promise<Map<string, string>> {
  const url = process.env.WALLET_MAPPINGS_URL;
  if (!url) throw new Error('WALLET_MAPPINGS_URL not set');
  // Use fetchWithOffload — the wallet-mappings Lambda offloads its payload to
  // S3 (presigned URL) since the gzipped wallet table exceeds the 6MB Lambda
  // response limit. A plain fetch would return the indirection envelope and
  // size 0, silently producing an empty identityToWallet map.
  const data = await fetchWithOffload<{ wallets?: Record<string, string> }>({
    url,
    apiKey: process.env.WALLET_MAPPINGS_API_KEY,
    label: 'WalletMappings',
    timeoutMs: 30_000,
  });
  if (!data) throw new Error('Wallet mappings fetch returned null');
  const map = new Map<string, string>();
  for (const [addr, id] of Object.entries(data.wallets ?? {})) {
    // walletAddress (lowercased) -> identityId, same shape the scanner uses
    // for registeredWallets. updateIdentityToWalletMap reverses internally.
    map.set(addr.toLowerCase(), id);
  }
  return map;
}

async function main() {
  if (!pointsDb) {
    console.error('POINTS_DATABASE_URL not set');
    process.exit(1);
  }
  if (!REFERRAL_REWARD_ENABLED) {
    console.error('REFERRAL_REWARD_ENABLED is not true. Refusing to backfill.');
    process.exit(1);
  }

  const dates = parseArgs();
  if (dates.length === 0) {
    console.error('Usage: backfill-referral-bonus-day --date YYYY-MM-DD [--date YYYY-MM-DD ...]');
    process.exit(1);
  }
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      console.error(`Invalid date: ${d} (expected YYYY-MM-DD)`);
      process.exit(1);
    }
  }

  // Seed both module-level caches before invoking the batch. Without these
  // the cache iterations inside runDailyReferralBonus would be empty and
  // it would return 0 with no error.
  console.log('[Backfill-Ref] Loading wallet mappings…');
  const wallets = await fetchRegisteredWallets();
  updateIdentityToWalletMap(wallets);
  console.log(`[Backfill-Ref] identityToWallet entries: ${getIdentityToWalletMap().size}`);

  console.log('[Backfill-Ref] Loading referral mappings…');
  await maybeRefreshReferralCache();
  const refSize = getReferralCache().size;
  console.log(`[Backfill-Ref] referralCache entries: ${refSize}`);
  if (refSize === 0) {
    console.error('Referral cache empty after refresh; aborting (would insert 0 rows).');
    process.exit(1);
  }

  // Process in ASC order so logs read chronologically and any cap math
  // mirrors the natural daily run.
  dates.sort();
  let totalInserted = 0;
  for (const d of dates) {
    console.log(`[Backfill-Ref] === ${d} ===`);
    const inserted = await runDailyReferralBonus(d);
    console.log(`[Backfill-Ref] ${d}: inserted ${inserted} rows`);
    totalInserted += inserted;
  }
  console.log(`[Backfill-Ref] DONE. Total rows inserted across ${dates.length} day(s): ${totalInserted}`);

  await pointsDb.end();
}

main().catch((err) => {
  console.error('[Backfill-Ref] failed:', err);
  process.exit(1);
});
