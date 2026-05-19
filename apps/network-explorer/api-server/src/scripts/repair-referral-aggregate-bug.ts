/**
 * One-shot repair: aggregate-bug catchup for daily referral bonuses.
 *
 * BACKGROUND
 * The 2026-05-11 daily-referral-bonus implementation emitted one
 * `l1-bonus` row per (referrer, referee) pair, all sharing the same
 * `ref-daily-l1:{referrerId}:{date}` digest. The unique constraint then
 * collapsed every duplicate via `ON CONFLICT DO NOTHING`, leaving each
 * referrer credited for only the FIRST referee processed in the batch.
 * Discovered 2026-05-18 in post-fix audit of the 5/17 snapshot lockout
 * incident.
 *
 * The bug has been fixed in daily-referral-bonus.ts (aggregate per
 * referrer before insert). This script issues a one-time CATCHUP row per
 * (referrer, date) for the partial-credit window so the affected
 * referrers receive the points they were undercredited.
 *
 * Idempotent: catchup rows use a distinct digest
 * `ref-daily-l1-catchup:{referrerId}:{date}` so re-running this script
 * is safe (ON CONFLICT DO NOTHING). The original partial-credit rows
 * are left in place (activity_points DELETE is blocked by trigger; the
 * forward-only invariant means we only ADD).
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   node dist/scripts/repair-referral-aggregate-bug.js --date 2026-05-16 --date 2026-05-17
 *   node dist/scripts/repair-referral-aggregate-bug.js --date 2026-05-16 --dry-run
 */

import { pointsDb } from '../db.js';
import {
  maybeRefreshReferralCache,
  updateIdentityToWalletMap,
  getReferralCache,
  getIdentityToWalletMap,
} from '../scanner/referral-bonus.js';
import {
  REFERRAL_REWARD_ENABLED,
  REFERRAL_L1_BONUS_RATE,
  REFERRAL_DAILY_BONUS_CAP,
} from '../config/referral.js';
import { fetchWithOffload } from '../scanner/fetch-with-offload.js';

const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;

interface Args {
  dates: string[];
  dryRun: boolean;
}

function parseArgs(): Args {
  const dates: string[] = [];
  let dryRun = false;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--date' && argv[i + 1]) dates.push(argv[++i]);
    else if (a.startsWith('--date=')) dates.push(a.slice('--date='.length));
  }
  return { dates, dryRun };
}

async function fetchRegisteredWallets(): Promise<Map<string, string>> {
  const url = process.env.WALLET_MAPPINGS_URL;
  if (!url) throw new Error('WALLET_MAPPINGS_URL not set');
  const data = await fetchWithOffload<{ wallets?: Record<string, string> }>({
    url,
    apiKey: process.env.WALLET_MAPPINGS_API_KEY,
    label: 'WalletMappings',
    timeoutMs: 30_000,
  });
  if (!data) throw new Error('Wallet mappings fetch returned null');
  const map = new Map<string, string>();
  for (const [addr, id] of Object.entries(data.wallets ?? {})) {
    map.set(addr.toLowerCase(), id);
  }
  return map;
}

async function repairDate(dateStr: string, dryRun: boolean): Promise<{ referrers: number; delta: number }> {
  if (!pointsDb) throw new Error('pointsDb null');
  const cache = getReferralCache();
  const identityToWallet = getIdentityToWalletMap();
  const nowMs = Date.now();

  // Build eligible list (mirrors runDailyReferralBonus).
  type Eligible = { referredId: string; referrerId: string; activatedMs: number };
  const eligible: Eligible[] = [];
  for (const [referredId, entry] of cache) {
    if (!entry.activatedAt) continue;
    const activatedMs = Date.parse(entry.activatedAt);
    if (!Number.isFinite(activatedMs)) continue;
    if (nowMs - activatedMs > EXPIRY_MS) continue;
    eligible.push({ referredId, referrerId: entry.referrerId, activatedMs });
  }

  const yesterdayStartMs = Date.parse(`${dateStr}T00:00:00.000Z`);
  const yesterdayEndMs = yesterdayStartMs + 24 * 60 * 60 * 1000 - 1;

  // Compute per-referrer expected total for the date.
  const expectedByReferrer = new Map<string, number>();
  for (const e of eligible) {
    if (e.activatedMs > yesterdayEndMs) continue;
    const activatedAtIso = new Date(e.activatedMs).toISOString();
    const sumRows = await pointsDb<Array<{ total: string }>>`
      SELECT COALESCE(SUM(final_points), 0)::numeric AS total
      FROM activity_points
      WHERE identity_id = ${e.referredId}
        AND (tx_timestamp AT TIME ZONE 'UTC')::date = ${dateStr}::date
        AND tx_timestamp >= ${activatedAtIso}::timestamptz
        AND category <> 'referral-bonus'
        AND NOT flagged
    `;
    const refereeTotal = Number(sumRows[0]?.total) || 0;
    if (refereeTotal <= 0) continue;
    const refBonus = Math.min(refereeTotal * REFERRAL_L1_BONUS_RATE, REFERRAL_DAILY_BONUS_CAP);
    const refBonusFixed = Number(refBonus.toFixed(2));
    if (refBonusFixed <= 0) continue;
    expectedByReferrer.set(
      e.referrerId,
      Number(((expectedByReferrer.get(e.referrerId) ?? 0) + refBonusFixed).toFixed(2)),
    );
  }

  // Fetch already-credited l1-bonus per referrer on this date (existing partial rows).
  const existingRows = await pointsDb<Array<{ identity_id: string; total: string }>>`
    SELECT identity_id, SUM(final_points)::numeric AS total
    FROM activity_points
    WHERE category = 'referral-bonus'
      AND activity_type = 'l1-bonus'
      AND (tx_timestamp AT TIME ZONE 'UTC')::date = ${dateStr}::date
    GROUP BY identity_id
  `;
  const existingByReferrer = new Map<string, number>();
  for (const r of existingRows) {
    existingByReferrer.set(r.identity_id, Number(r.total) || 0);
  }

  // Compute deltas.
  const inserts: Array<{
    wallet_address: string; identity_id: string; tx_digest: string;
    tx_sequence_number: number; category: string; activity_type: string;
    base_points: number; volume_tier: number; genesis_multiplier: number;
    final_points: string; tx_timestamp: Date; event_seq: number;
  }> = [];
  const txTimestamp = new Date(`${dateStr}T23:59:59.000Z`);
  let totalDelta = 0;

  for (const [referrerId, expected] of expectedByReferrer) {
    const already = existingByReferrer.get(referrerId) ?? 0;
    const delta = Number((expected - already).toFixed(2));
    if (delta <= 0.005) continue; // float tolerance
    const wallet = identityToWallet.get(referrerId);
    if (!wallet) {
      console.warn(`[Repair] ${dateStr} ${referrerId.slice(-12)}: delta=${delta} but no wallet, skipping`);
      continue;
    }
    inserts.push({
      wallet_address: wallet,
      identity_id: referrerId,
      tx_digest: `ref-daily-l1-catchup:${referrerId}:${dateStr}`,
      tx_sequence_number: 0,
      category: 'referral-bonus',
      activity_type: 'l1-bonus',
      base_points: delta,
      volume_tier: 1.0,
      genesis_multiplier: 1.0,
      final_points: delta.toFixed(2),
      tx_timestamp: txTimestamp,
      event_seq: 0,
    });
    totalDelta += delta;
    console.log(`[Repair] ${dateStr} ${referrerId.slice(-12)}: expected=${expected} already=${already} delta=${delta}`);
  }

  if (inserts.length === 0 || dryRun) {
    return { referrers: inserts.length, delta: Number(totalDelta.toFixed(2)) };
  }

  const result = await pointsDb`
    INSERT INTO activity_points ${pointsDb(inserts, 'wallet_address', 'identity_id', 'tx_digest', 'tx_sequence_number', 'category', 'activity_type', 'base_points', 'volume_tier', 'genesis_multiplier', 'final_points', 'tx_timestamp', 'event_seq')}
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;
  console.log(`[Repair] ${dateStr}: inserted ${result.count} catchup rows (delta sum: ${totalDelta.toFixed(2)}pt)`);
  return { referrers: result.count, delta: Number(totalDelta.toFixed(2)) };
}

async function main() {
  if (!pointsDb) { console.error('POINTS_DATABASE_URL not set'); process.exit(1); }
  if (!REFERRAL_REWARD_ENABLED) { console.error('REFERRAL_REWARD_ENABLED is not true'); process.exit(1); }

  const { dates, dryRun } = parseArgs();
  if (dates.length === 0) {
    console.error('Usage: repair-referral-aggregate-bug --date YYYY-MM-DD [--date ...] [--dry-run]');
    process.exit(1);
  }

  console.log('[Repair] Loading wallet mappings…');
  const wallets = await fetchRegisteredWallets();
  updateIdentityToWalletMap(wallets);
  console.log(`[Repair] identityToWallet: ${getIdentityToWalletMap().size}`);

  console.log('[Repair] Loading referral mappings…');
  await maybeRefreshReferralCache();
  console.log(`[Repair] referralCache: ${getReferralCache().size}`);

  dates.sort();
  let totalRows = 0;
  let totalDelta = 0;
  for (const d of dates) {
    console.log(`[Repair] === ${d}${dryRun ? ' (DRY RUN)' : ''} ===`);
    const r = await repairDate(d, dryRun);
    totalRows += r.referrers;
    totalDelta += r.delta;
  }
  console.log(`[Repair] DONE. ${dryRun ? 'WOULD INSERT' : 'INSERTED'} ${totalRows} rows totalling ${totalDelta.toFixed(2)}pt across ${dates.length} day(s).`);

  await pointsDb.end();
}

main().catch(err => { console.error('[Repair] failed:', err); process.exit(1); });
