/**
 * Nasun Standing Index (NSI) hourly compute worker.
 *
 * NSI is the protocol-internal measure of earned onchain participation. Each
 * identity gets a score in [0, 1000] derived from five sub-scores, weighted:
 *
 *   NSI = 0.35 * staking_score
 *       + 0.20 * lp_score
 *       + 0.20 * tx_activity_score
 *       + 0.15 * diversity_score
 *       + 0.10 * nft_health_score
 *
 * The tier is derived from NSI plus a Genesis Pass floor:
 *   nsi_tier   = NSI >= 600 ? 3 : NSI >= 250 ? 2 : 1
 *   gp_floor   = has_gp ? 2 : 1
 *   final_tier = max(nsi_tier, gp_floor)
 *
 * For the first 7 days after launch we apply a monotone-up policy
 * (`display_tier = max(final_tier, max_seen_tier)`) so initial users don't
 * see oscillating tiers while the formula is still being calibrated.
 *
 * Isolation: this worker runs in `tier-worker` (pm2 fork), never inside the
 * main scanner's `scanLoop`. A snapshot lockout (5/9-class incident) on the
 * `ecosystem_score_snapshots` table cannot block or corrupt NSI computation.
 */

import { sql as indexerDb, pointsDb } from '../db.js';
import { sendTelegramAlert } from '../utils/alert.js';
import { getAllWalletsPerIdentity } from './identity-wallet.js';

const COMPUTE_INTERVAL_MS = 60 * 60 * 1000; // 1h

// === Sub-score weights ===
const W_STAKING = 0.35;
const W_LP = 0.2;
const W_TX = 0.2;
const W_DIVERSITY = 0.15;
const W_NFT = 0.1;

// === Tier thresholds (NSI 0-1000 range) ===
// T3 lowered 600→500 (2026-05-23) after first-cycle distribution showed only
// 14 users ≥600 (target ~500). NSI cold start: 30d sliding window has 1 day
// of data; revisit after window fully populates (~2026-06-22).
const TIER_3_THRESHOLD = 500;
const TIER_2_THRESHOLD = 250;

// === Sub-score normalization constants ===
// staking: 10 NSN -> 0, 1K NSN -> 500, 100K NSN -> 1000
const STAKING_DIVISOR = 10;
const STAKING_SCALE = 250;

// lp: $1 -> 0, $100 -> 500, $10K -> 1000
const LP_DIVISOR = 1;
const LP_SCALE = 250;

// tx activity (Phase 1: lifetime count, Phase 1.5 -> 30-day window)
// 1 tx -> 0, 10 -> 250, 100 -> 500, 10K -> 1000 (cap)
const TX_SCALE = 250;

// diversity: 0 categories -> 0, 7 -> 1000
const DIVERSITY_CATEGORIES_MAX = 7;

// nft health: alliance 100% only -> 500, gp 100% only -> 1000,
// alliance+gp 100% -> 1500 (cap 1000)
const NFT_ALLIANCE_WEIGHT = 1;
const NFT_GP_WEIGHT = 2;
const NFT_SCALE = 5;

const NSN_DECIMALS = 9n;
const NSN_DIVISOR = 10n ** NSN_DECIMALS;

// Monotone-up window: during launch we suppress tier downgrades to give the
// formula time to stabilize. Set via env (`NSI_MONOTONE_UP_UNTIL=2026-05-29T00:00:00Z`)
// so a misconfigured launch date doesn't auto-flip to "everyone can drop" without
// notice. When the env is unset the policy is OFF (sliding-window from day one).
const MONOTONE_UP_UNTIL = process.env.NSI_MONOTONE_UP_UNTIL
  ? new Date(process.env.NSI_MONOTONE_UP_UNTIL)
  : null;

const BATCH_SIZE = 500;
const STALE_SNAPSHOT_GUARD_DAYS = 2;
let monotoneUpExpiryAlertSent = false;

let lastSuccessAt: Date | null = null;
let errorCount24h = 0;
let timer: NodeJS.Timeout | null = null;

interface ComputedRow {
  identity_id: string;
  wallet_address: string;
  tier: number;
  previous_tier: number | null;
  max_seen_tier: number;
  nsi_score: number;
  sub_scores: Record<string, number>;
  has_gp: boolean;
}

export function startNsiCompute(): void {
  if (process.env.ENABLE_NSI_COMPUTE !== 'true') {
    console.log('[nsi-compute] disabled (set ENABLE_NSI_COMPUTE=true)');
    return;
  }
  if (!pointsDb) {
    console.warn('[nsi-compute] pointsDb unavailable, skipping');
    return;
  }
  timer = setInterval(runCompute, COMPUTE_INTERVAL_MS);
  runCompute().catch((err) => console.error('[nsi-compute] initial run failed', err));
}

export function stopNsiCompute(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function log10Safe(x: number): number {
  return x <= 0 ? 0 : Math.log10(x);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function runCompute(): Promise<void> {
  if (!pointsDb) return;
  const started = Date.now();

  try {
    // Sanity gate: if staking snapshots are stale or missing, computing NSI yields
    // a misleading staking sub-score (all-zero). Alert and skip rather than write
    // bad data — first-run case (table empty) is treated as stale.
    const staleCheck = await pointsDb<Array<{ latest: Date | null }>>`
      SELECT MAX(day)::timestamptz AS latest FROM user_staking_daily_snapshots
    `;
    const latestStakingDay = staleCheck[0]?.latest ?? null;
    if (!latestStakingDay) {
      console.warn('[nsi-compute] no staking snapshots yet — skipping cycle (waiting for staking-principal-sync bootstrap)');
      await sendTelegramAlert(
        'nsi-compute skipped: user_staking_daily_snapshots empty (first-run bootstrap)',
        { dedupKey: 'nsi-compute-bootstrap' },
      );
      return;
    }
    const ageDays = (Date.now() - latestStakingDay.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > STALE_SNAPSHOT_GUARD_DAYS) {
      console.warn(`[nsi-compute] staking snapshots stale (${ageDays.toFixed(1)}d) — skipping cycle`);
      await sendTelegramAlert(
        `nsi-compute skipped: staking snapshots stale (${ageDays.toFixed(1)} days)`,
        { dedupKey: 'nsi-compute-stale-staking' },
      );
      return;
    }

    // Monotone-up expiry alert: when the window transitions off, fire once so
    // operators know mass tier movements may follow. Suppressed on subsequent
    // cycles via the module-level latch.
    const monotoneActive = MONOTONE_UP_UNTIL !== null && Date.now() < MONOTONE_UP_UNTIL.getTime();
    if (!monotoneActive && MONOTONE_UP_UNTIL !== null && !monotoneUpExpiryAlertSent) {
      monotoneUpExpiryAlertSent = true;
      try {
        await sendTelegramAlert(
          `[nsi-compute] monotone-up window expired at ${MONOTONE_UP_UNTIL.toISOString()} — tier downgrades now possible`,
          { dedupKey: 'nsi-monotone-expired' },
        );
      } catch {
        // ignore
      }
    }

    // Stage A: 30-day avg staking principal (NSN units, fractional).
    const stakingAvg = await pointsDb<Array<{ identity_id: string; avg_mist: string }>>`
      SELECT identity_id, AVG(staked_nsn_mist)::text AS avg_mist
      FROM user_staking_daily_snapshots
      WHERE day >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY identity_id
    `;
    const stakingMap = new Map<string, number>();
    for (const r of stakingAvg) {
      // AVG of a numeric(30,0) returns a decimal string. Convert via Number()
      // — at the relevant scale (<= 100M NSN) Number precision is sufficient.
      const mistAsNumber = Number(r.avg_mist);
      if (Number.isFinite(mistAsNumber)) {
        stakingMap.set(r.identity_id, mistAsNumber / Number(NSN_DIVISOR));
      }
    }

    // Stage B: 30-day avg LP USD (Phase 1: GoStop bankroll only; all venues summed).
    const lpAvg = await pointsDb<Array<{ identity_id: string; avg_lp_usd: string }>>`
      SELECT identity_id, AVG(lp_usd)::text AS avg_lp_usd
      FROM user_lp_daily_snapshots
      WHERE day >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY identity_id
    `;
    const lpMap = new Map<string, number>();
    for (const r of lpAvg) {
      const v = Number(r.avg_lp_usd);
      if (Number.isFinite(v)) lpMap.set(r.identity_id, v);
    }

    // Stage C: tx activity from indexer's tx_affected_addresses.
    // Schema: (tx_sequence_number BIGINT, affected BYTEA, sender BYTEA, PK(affected, tx_sequence_number))
    // — there is one row per (tx, affected_address), so plain COUNT(*) per sender
    // would over-count by the number of addresses touched per tx. Use DISTINCT
    // tx_sequence_number for the true unique-tx count.
    // 30-day window requires joining `checkpoints` (no time column on this table)
    // and is deferred to Phase 1.5. Phase 1 uses lifetime distinct-tx count.
    const txCounts = await indexerDb<Array<{ sender_hex: string; tx_count: string }>>`
      SELECT encode(sender, 'hex') AS sender_hex,
             COUNT(DISTINCT tx_sequence_number)::text AS tx_count
      FROM tx_affected_addresses
      WHERE sender IS NOT NULL
      GROUP BY sender
    `;
    const txMap = new Map<string, number>(); // wallet (0x-prefixed, lowercase) -> tx count
    for (const r of txCounts) {
      const v = Number(r.tx_count);
      if (Number.isFinite(v)) txMap.set('0x' + r.sender_hex.toLowerCase(), v);
    }

    // Stage D: 30-day distinct ecosystem categories. Filters on tx_timestamp
    // (idx_ap_timestamp) rather than processed_at — the latter has no index
    // and would force a sequential scan over 18M rows.
    const diversity = await pointsDb<Array<{ identity_id: string; distinct_count: string }>>`
      SELECT identity_id, COUNT(DISTINCT category)::text AS distinct_count
      FROM activity_points
      WHERE tx_timestamp >= now() - INTERVAL '30 days' AND identity_id IS NOT NULL
      GROUP BY identity_id
    `;
    const diversityMap = new Map<string, number>();
    for (const r of diversity) diversityMap.set(r.identity_id, Number(r.distinct_count));

    // Stage E: NFT health.
    const nftRows = await pointsDb<
      Array<{ identity_id: string; nft_type: string; health_pct: string }>
    >`
      SELECT identity_id, nft_type, health_pct::text
      FROM nft_health_state
      WHERE health_pct > 0
    `;
    const allianceHealthMap = new Map<string, number>();
    const gpHealthMap = new Map<string, number>();
    const gpSet = new Set<string>();
    for (const r of nftRows) {
      const pct = Number(r.health_pct);
      if (!Number.isFinite(pct)) continue;
      if (r.nft_type === 'alliance') {
        allianceHealthMap.set(r.identity_id, pct);
      } else if (r.nft_type === 'genesis-pass') {
        gpHealthMap.set(r.identity_id, pct);
        gpSet.add(r.identity_id);
      }
    }

    // Stage F: all wallets per identity. Shares the cycle-scoped helper cache
    // with staking-principal-sync (single SQL per cycle, ~1s warm). Summing
    // tx_count across all controlled wallets also fixes a silent
    // multi-wallet undercount in the previous "latest wallet only" shape.
    const walletsByIdentity = await getAllWalletsPerIdentity();

    // Stage G: existing user_nsi rows (for previous_tier + max_seen_tier).
    const existing = await pointsDb<
      Array<{ identity_id: string; tier: number; max_seen_tier: number }>
    >`
      SELECT identity_id, tier, max_seen_tier FROM user_nsi
    `;
    const existingMap = new Map<string, { tier: number; max_seen_tier: number }>();
    for (const r of existing) {
      existingMap.set(r.identity_id, { tier: r.tier, max_seen_tier: r.max_seen_tier });
    }

    // Union of identities seen anywhere.
    const allIdentities = new Set<string>([
      ...stakingMap.keys(),
      ...lpMap.keys(),
      ...diversityMap.keys(),
      ...allianceHealthMap.keys(),
      ...gpHealthMap.keys(),
      ...walletsByIdentity.keys(),
    ]);

    const isMonotoneUpPeriod = monotoneActive;
    const computed: ComputedRow[] = [];

    for (const identityId of allIdentities) {
      const wallets = walletsByIdentity.get(identityId);
      if (!wallets || wallets.length === 0) continue;

      const avgStakedNsn = stakingMap.get(identityId) ?? 0;
      const stakingScore = Math.min(
        1000,
        log10Safe(Math.max(1, avgStakedNsn / STAKING_DIVISOR)) * STAKING_SCALE,
      );

      const avgLpUsd = lpMap.get(identityId) ?? 0;
      const lpScore = Math.min(1000, log10Safe(Math.max(1, avgLpUsd / LP_DIVISOR)) * LP_SCALE);

      // Sum tx_count across every wallet controlled by this identity.
      // Display wallet = most tx-active wallet (mirrors the old "latest tx"
      // semantics and ensures standing API lookup hits for the wallet the
      // user is most likely querying with).
      let txCount = 0;
      let wallet = wallets[0];
      let walletMaxTx = 0;
      for (const w of wallets) {
        const wTx = txMap.get(w.toLowerCase()) ?? 0;
        txCount += wTx;
        if (wTx > walletMaxTx) { walletMaxTx = wTx; wallet = w; }
      }
      const txScore = Math.min(1000, log10Safe(Math.max(1, txCount)) * TX_SCALE);

      const distinctCount = diversityMap.get(identityId) ?? 0;
      const diversityScore = Math.min(
        1000,
        (Math.min(distinctCount, DIVERSITY_CATEGORIES_MAX) / DIVERSITY_CATEGORIES_MAX) * 1000,
      );

      const allianceHealth = allianceHealthMap.get(identityId) ?? 0;
      const gpHealth = gpHealthMap.get(identityId) ?? 0;
      const nftRaw = allianceHealth * NFT_ALLIANCE_WEIGHT + gpHealth * NFT_GP_WEIGHT;
      const nftScore = Math.min(1000, nftRaw * NFT_SCALE);

      const nsi =
        stakingScore * W_STAKING +
        lpScore * W_LP +
        txScore * W_TX +
        diversityScore * W_DIVERSITY +
        nftScore * W_NFT;

      const nsiTier = nsi >= TIER_3_THRESHOLD ? 3 : nsi >= TIER_2_THRESHOLD ? 2 : 1;
      const hasGp = gpSet.has(identityId);
      const gpFloor = hasGp ? 2 : 1;
      const computedTier = Math.max(nsiTier, gpFloor);

      const prev = existingMap.get(identityId);
      const previousTier = prev?.tier ?? null;
      const prevMaxSeen = prev?.max_seen_tier ?? 1;

      // `max_seen_tier` tracks the highest *earned* tier — based on `nsiTier`
      // (the score-derived tier before GP floor), NOT `computedTier` or
      // `finalTier`. Otherwise a GP holder's max_seen jumps to 2 just from
      // holding the NFT and never reflects whether the user actually earned it.
      // After NFT loss, max_seen should reflect the user's own onchain history.
      const newMaxSeen = Math.max(prevMaxSeen, nsiTier);

      // Monotone-up window: display the higher of "what we just computed" vs
      // "highest earned tier ever". GP holders' floor (`gpFloor`) is already
      // baked into `computedTier`, so this also preserves the floor automatically.
      const finalTier = isMonotoneUpPeriod ? Math.max(computedTier, prevMaxSeen) : computedTier;

      computed.push({
        identity_id: identityId,
        wallet_address: wallet,
        tier: finalTier,
        previous_tier: previousTier,
        max_seen_tier: newMaxSeen,
        nsi_score: round2(nsi),
        sub_scores: {
          staking: round2(stakingScore),
          lp: round2(lpScore),
          tx: round2(txScore),
          diversity: round2(diversityScore),
          nft: round2(nftScore),
        },
        has_gp: hasGp,
      });
    }

    // Bulk UPSERT in a single transaction. The `tx as unknown as typeof pointsDb`
    // cast follows the existing pattern in ban-service.ts:211 and settle-pado.ts:434
    // — postgres.js's transaction handle is callable both as template literal and
    // bulk-insert helper but TypeScript's narrowed type loses the call signatures.
    await pointsDb.begin(async (tx) => {
      const sql = tx as unknown as typeof pointsDb;
      if (!sql) return;
      for (let i = 0; i < computed.length; i += BATCH_SIZE) {
        const slice = computed.slice(i, i + BATCH_SIZE);
        const rows = slice.map((c) => ({
          identity_id: c.identity_id,
          wallet_address: c.wallet_address,
          tier: c.tier,
          previous_tier: c.previous_tier,
          max_seen_tier: c.max_seen_tier,
          nsi_score: c.nsi_score,
          sub_scores: c.sub_scores,
          has_gp: c.has_gp,
        }));
        await sql`
          INSERT INTO user_nsi ${sql(
            rows,
            'identity_id',
            'wallet_address',
            'tier',
            'previous_tier',
            'max_seen_tier',
            'nsi_score',
            'sub_scores',
            'has_gp',
          )}
          ON CONFLICT (identity_id) DO UPDATE SET
            wallet_address = EXCLUDED.wallet_address,
            previous_tier = user_nsi.tier,
            tier = EXCLUDED.tier,
            -- max_seen_tier is computed in JS as max(prev, nsiTier) and passed
            -- in EXCLUDED. Do not re-blend with EXCLUDED.tier (which is the
            -- display tier with GP floor + monotone-up applied).
            max_seen_tier = EXCLUDED.max_seen_tier,
            nsi_score = EXCLUDED.nsi_score,
            sub_scores = EXCLUDED.sub_scores,
            has_gp = EXCLUDED.has_gp,
            computed_at = now()
        `;
      }
    });

    lastSuccessAt = new Date();
    errorCount24h = 0;
    const dist = { t1: 0, t2: 0, t3: 0 };
    for (const c of computed) {
      if (c.tier === 1) dist.t1++;
      else if (c.tier === 2) dist.t2++;
      else dist.t3++;
    }
    console.log(
      `[nsi-compute] computed ${computed.length} NSIs in ${Date.now() - started}ms ` +
        `(t1=${dist.t1}, t2=${dist.t2}, t3=${dist.t3}, monotone_up=${isMonotoneUpPeriod})`,
    );
  } catch (err) {
    errorCount24h++;
    console.error('[nsi-compute] failed', err);
    if (errorCount24h % 6 === 1) {
      try {
        await sendTelegramAlert(
          `nsi-compute failed (${errorCount24h}x in 24h): ${(err as Error).message}`,
          { dedupKey: 'nsi-compute-fail' },
        );
      } catch {
        // ignore
      }
    }
  }
}

export function getNsiComputeHealth(): { lastSuccessAt: Date | null; errorCount24h: number } {
  return { lastSuccessAt, errorCount24h };
}
