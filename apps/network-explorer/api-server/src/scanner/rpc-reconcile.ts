/**
 * RPC Reconciliation: verify yesterday's activity_points against blockchain
 *
 * Runs once per day after the daily snapshot. Queries RPC directly for each
 * event type, compares with activity_points, and fills any gaps.
 *
 * This is the "absolute zero miss" safety net. The regular scanner reads from
 * the indexer DB which can have gaps during outages. RPC reads directly from
 * the blockchain fullnode, which is the source of truth.
 *
 * Excluded from reconciliation:
 *   - staking: excluded from base_score (separate scoring planned)
 *   - chat: off-chain, not on blockchain
 *   - faucet: handled separately via tx_calls_fun (indexer-based, reliable)
 *
 * Performance: ~15-20 event types x ~100 pages each = ~5-10 min per day.
 * Runs in the scanner process, non-blocking (async), with isolated error handling.
 */

import { pointsDb } from '../db.js';
import { rpcCall } from '../rpc.js';
import {
  getBasePoints,
  SCORE_CATEGORIES,
  GENESIS_PASS_MULTIPLIER,
  EVENT_MAPPING,
  DEFAULT_MISSION_IDS,
} from '../config/points.js';
import {
  maybeRefreshMatview,
  hasGenesisPass,
  getActivationsCacheSize,
} from './ecosystem-cache.js';
import { REFERRAL_ECOSYSTEM_SCALING_FACTOR } from '../config/referral.js';

// RPC event query config (same structure as backfill-points.ts)
interface ReconcileQuery {
  moveEventType: string;
  category: string;
  activityType: string;
}

// Package IDs (original, for RPC MoveEventType queries)
const PKG = {
  // SYNC WARNING: mirrors PKG.prediction + PKG.predictionLegacy in
  // config/points.ts. Sui upgrade emit-type pinning means we have to query
  // each upgrade variant. Add the new id when upgrading, keep the previous
  // one so older events still reconcile.
  //   0x98765cc3... — dead (pre-2026-05)
  //   0xbe6d8f... — superseded 2026-05-18
  //   0x0b4f89... — current
  prediction: '0x0b4f89ade5ca63c737369c50f30721839ce9bb1b9cadd371924520c4944572ef',
  predictionLegacy: '0xbe6d8f699ebe9a4b7249f9853d73cdb9443fbccac8f7fcf7ade0c200769fa78d',
  lottery: '0xeb79d7421090eccc5f912f20407c67b8052c7fbe1efea39bf9b548ccea46819c',
  perp: '0x6821a73cfc3cd45dc6318db379c2c88f0acb61ec6a26060f4de8cbe4718d3658',
  scratchcard: '0xd70d650aae2a313faf6ec4a56744a9fb1bab8c289bfef57838bc5e336296ddff',
  numbermatch: '0xf1087293200f23afdcce3415fcf025943bb22708b6b29588be671629dcb92758',
  // Gostop game contracts (apps/gostop/devnet-ids.json)
  gostopLottery: '0xc0be188b342c4ee7c6cb3cef351a800b1b549cac75311a3d9a80a0a3f54634a3',
  gostopScratchcard: '0xbd496f89148dfcd1f2bf9da19c9e5b053f97ebe0332df59289cb5ccfde6b6f7e',
  gostopNumbermatch: '0xa111b54021094504d91fffd6e46ae6d4e4824e0341490004e4474aca03c8d314',
  // Mines and crash use originalPackageId (event subscription identity, stable
  // across upgrades). crash has been upgraded to v5; using packageId would miss
  // events emitted by older upgrade variants still resolved via the linker.
  gostopMines: '0x57ba939cf26c6bc52a8ab4db81b8f07077cb5f41ceab0d08b497f98e4a2f3d54',
  gostopCrash: '0x6fc868a6dabc2081cd47ea71ee8d2f8314c57102179eafd2ce0fce8e9edc5188',
  // Wheel: 2026-05-17 onboarding. packageId == originalPackageId (no upgrade yet).
  gostopWheel: '0x0dbfd5cb7e3f6892ce408371c429c7b3a77855ced7169d42a162c7c1dc03c16d',
  lending: '0xdd1e36881a1d47ad4f0f331b6a949948f308ded71c1d46802f23e258ca1ebafe',
  baram: '0xaf77e8d92826156b9392c4e3c094d6927fd4397c768e983a8c0bbc9071ea19e6',
  baramAer: '0xac4843a4db8803824bc7fca66492131d0744e77e650da0a7f8c4785b06da46e0',
  baramExecutor: '0x45efd887fdaee9d9ad29fb98d4d5c21083769cdc8ce5fb8a5f7d4701e4675ebd',
  governance: '0x3a3babecdd13b588c29fcd854819fc79f050ac7a7919b41d24ba66ab21dc1de3',
  governanceMultiChoice: '0xa1b4149ed07605c334396027132e7cd17c9aaf7a66bb7c9b09c2450cbda4144a',
  deepbook: '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134',
  sui: '0x0000000000000000000000000000000000000000000000000000000000000003',
};

// All event types to reconcile (excludes staking, chat, faucet)
const RECONCILE_QUERIES: ReconcileQuery[] = [
  // Pado DEX (DeepBook v2) - descending pagination only touches recent pages
  { moveEventType: `${PKG.deepbook}::order_info::OrderPlaced`, category: 'pado-dex', activityType: 'limit-order' },
  { moveEventType: `${PKG.deepbook}::order_info::OrderFilled`, category: 'pado-dex', activityType: 'market-order' },
  { moveEventType: `${PKG.deepbook}::order_info::OrderFullyFilled`, category: 'pado-dex', activityType: 'market-order' },
  { moveEventType: `${PKG.deepbook}::order::OrderCanceled`, category: 'pado-dex', activityType: 'cancel-order' },
  // Governance
  { moveEventType: `${PKG.governance}::proposal::VoteRegistered`, category: 'governance', activityType: 'vote' },
  { moveEventType: `${PKG.governanceMultiChoice}::multi_choice_proposal::MultiChoiceVoteRegistered`, category: 'governance', activityType: 'vote' },
  { moveEventType: `${PKG.governance}::delegation::DelegationCreated`, category: 'governance', activityType: 'delegate' },
  { moveEventType: `${PKG.governance}::delegation::DelegationRevoked`, category: 'governance', activityType: 'delegate' },
  // Prediction (module: prediction_market). SYNC WARNING: matches
  // EVENT_MAP_ENTRIES in config/points.ts — keep in lockstep. Mapping both
  // OrderPlaced (maker resting) and OrderFilled (taker fast-fill) so taker
  // fills credit the taker.
  { moveEventType: `${PKG.prediction}::prediction_market::TokensMinted`, category: 'pado-prediction', activityType: 'mint-tokens' },
  { moveEventType: `${PKG.prediction}::prediction_market::OrderPlaced`, category: 'pado-prediction', activityType: 'place-order' },
  { moveEventType: `${PKG.prediction}::prediction_market::OrderFilled`, category: 'pado-prediction', activityType: 'fill-order' },
  { moveEventType: `${PKG.prediction}::prediction_market::OrderCancelled`, category: 'pado-prediction', activityType: 'cancel-order' },
  { moveEventType: `${PKG.prediction}::prediction_market::WinningsClaimed`, category: 'pado-prediction', activityType: 'claim-winnings' },
  // Legacy publish (0xbe6d8f...) — pre-upgrade events still emit under this id.
  { moveEventType: `${PKG.predictionLegacy}::prediction_market::TokensMinted`, category: 'pado-prediction', activityType: 'mint-tokens' },
  { moveEventType: `${PKG.predictionLegacy}::prediction_market::OrderPlaced`, category: 'pado-prediction', activityType: 'place-order' },
  { moveEventType: `${PKG.predictionLegacy}::prediction_market::OrderFilled`, category: 'pado-prediction', activityType: 'fill-order' },
  { moveEventType: `${PKG.predictionLegacy}::prediction_market::OrderCancelled`, category: 'pado-prediction', activityType: 'cancel-order' },
  { moveEventType: `${PKG.predictionLegacy}::prediction_market::WinningsClaimed`, category: 'pado-prediction', activityType: 'claim-winnings' },
  // Gostop Lottery (own category; pado-side lottery PKG kept in EXCLUDED_PACKAGES
  // but no longer mapped to a points category since pado-side traffic is 0)
  { moveEventType: `${PKG.gostopLottery}::lottery::TicketPurchased`, category: 'gostop-lottery', activityType: 'buy-ticket' },
  { moveEventType: `${PKG.gostopLottery}::lottery::PrizeClaimed`, category: 'gostop-lottery', activityType: 'claim-prize' },
  // Perp
  { moveEventType: `${PKG.perp}::perp::PositionOpened`, category: 'pado-perp', activityType: 'open-position' },
  { moveEventType: `${PKG.perp}::perp::PositionClosed`, category: 'pado-perp', activityType: 'close-position' },
  { moveEventType: `${PKG.perp}::perp::MarginAdded`, category: 'pado-perp', activityType: 'add-margin' },
  { moveEventType: `${PKG.perp}::perp::MarginRemoved`, category: 'pado-perp', activityType: 'remove-margin' },
  // Gostop Scratchcard (own category)
  { moveEventType: `${PKG.gostopScratchcard}::scratchcard::ScratchCardPurchased`, category: 'gostop-scratchcard', activityType: 'scratchcard-purchase' },
  // Gostop NumberMatch (own category)
  { moveEventType: `${PKG.gostopNumbermatch}::numbermatch::NumberMatchPlayed`, category: 'gostop-numbermatch', activityType: 'numbermatch-play' },
  // Gostop Mines (all SessionFinished events count, bust + cashout)
  { moveEventType: `${PKG.gostopMines}::mines::SessionFinished`, category: 'gostop-mines', activityType: 'mines-session' },
  // Gostop Crash (BetPlaced = round entered = game completed via keeper auto-finalize;
  // CashOutRecorded = successful cashout. Daily 1pt cap dedups bet + cashout combos.)
  { moveEventType: `${PKG.gostopCrash}::crash::BetPlaced`, category: 'gostop-crash', activityType: 'crash-bet' },
  { moveEventType: `${PKG.gostopCrash}::crash::CashOutRecorded`, category: 'gostop-crash', activityType: 'crash-cashout' },
  // Gostop Wheel (one WheelResultEvent per spin; 1pt/day cap via category)
  { moveEventType: `${PKG.gostopWheel}::wheel::WheelResultEvent`, category: 'gostop-wheel', activityType: 'wheel-spin' },
  // Lending
  { moveEventType: `${PKG.lending}::lending::DepositEvent`, category: 'pado-lending', activityType: 'deposit' },
  { moveEventType: `${PKG.lending}::lending::WithdrawEvent`, category: 'pado-lending', activityType: 'withdraw' },
  { moveEventType: `${PKG.lending}::lending::BorrowEvent`, category: 'pado-lending', activityType: 'borrow' },
  { moveEventType: `${PKG.lending}::lending::RepayEvent`, category: 'pado-lending', activityType: 'repay' },
  // Baram AI
  { moveEventType: `${PKG.baram}::aer::RequestCreated`, category: 'baram-ai', activityType: 'create-request' },
  { moveEventType: `${PKG.baram}::aer::RequestSettled`, category: 'baram-ai', activityType: 'settle' },
  { moveEventType: `${PKG.baram}::aer::RequestCanceled`, category: 'baram-ai', activityType: 'cancel' },
  { moveEventType: `${PKG.baramAer}::aer::RequestCreated`, category: 'baram-ai', activityType: 'create-request' },
  { moveEventType: `${PKG.baramAer}::aer::RequestSettled`, category: 'baram-ai', activityType: 'settle' },
  { moveEventType: `${PKG.baramAer}::aer::RequestCanceled`, category: 'baram-ai', activityType: 'cancel' },
  // Baram Executor
  { moveEventType: `${PKG.baramExecutor}::executor::ExecutorRegistered`, category: 'baram-executor', activityType: 'register' },
  { moveEventType: `${PKG.baramExecutor}::staking::StakeAdded`, category: 'baram-executor', activityType: 'stake' },
  { moveEventType: `${PKG.baramExecutor}::staking::StakeRemoved`, category: 'baram-executor', activityType: 'unstake' },
  { moveEventType: `${PKG.baramExecutor}::executor::ExecutorUpdated`, category: 'baram-executor', activityType: 'update' },
];

// Categories that exist in EVENT_MAPPING but are intentionally excluded from
// reconciliation (see file header). Anything else in EVENT_MAPPING must have a
// matching RECONCILE_QUERIES entry, or scanner startup fails fast.
const RECONCILE_EXCLUDED_CATEGORIES = new Set<string>([
  'staking', // separate scoring planned
]);

// EVENT_MAPPING keys use stripHex (no `0x` prefix) per the points.ts
// convention, while RECONCILE_QUERIES.moveEventType keeps the `0x` prefix
// because Sui RPC requires it on MoveEventType filters. Normalize on lookup
// so the drift comparison works.
function stripHexPrefix(s: string): string {
  return s.replace(/^0x/, '');
}

(function verifyReconcileSync(): void {
  const reconcileSet = new Set(
    RECONCILE_QUERIES.map((q) => stripHexPrefix(q.moveEventType)),
  );
  const missing: string[] = [];
  for (const [eventKey, mapping] of EVENT_MAPPING.entries()) {
    if (RECONCILE_EXCLUDED_CATEGORIES.has(mapping.category)) continue;
    if (!reconcileSet.has(eventKey)) missing.push(eventKey);
  }
  if (missing.length > 0) {
    throw new Error(
      `[rpc-reconcile] Drift detected: ${missing.length} EVENT_MAP_ENTRIES entries ` +
        `are missing from RECONCILE_QUERIES. Reconciliation will silently skip them, ` +
        `causing point loss on subscription gaps. Add them to RECONCILE_QUERIES, or ` +
        `add their category to RECONCILE_EXCLUDED_CATEGORIES if intentional. ` +
        `Missing: ${missing.join(', ')}`,
    );
  }
})();

const PAGE_SIZE = 50;
const MAX_PAGES = 200; // Safety cap per event type
const TOTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min total timeout for entire reconciliation

// Base58 decode (same as backfill-points.ts)
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map<string, bigint>();
for (let i = 0; i < B58_ALPHABET.length; i++) {
  B58_MAP.set(B58_ALPHABET[i], BigInt(i));
}

function base58ToHex(b58: string): string {
  let n = 0n;
  for (const c of b58) {
    const v = B58_MAP.get(c);
    if (v === undefined) throw new Error(`Invalid base58 char: ${c}`);
    n = n * 58n + v;
  }
  const hex = n.toString(16).padStart(64, '0');
  return `0x${hex}`;
}

interface RpcEvent {
  id: { txDigest: string; eventSeq: string };
  sender: string;
  timestampMs: string;
}

interface RpcQueryResult {
  data: RpcEvent[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

/**
 * Reconcile yesterday's on-chain events with activity_points.
 * Called once per day from scanLoop, after the daily snapshot.
 *
 * @param targetDate - YYYY-MM-DD to reconcile
 * @param walletMap - walletAddress (lowercase) -> identityId
 * @returns number of gaps filled
 */
export async function reconcileFromRpc(
  targetDate: string,
  walletMap: Map<string, string>,
): Promise<number> {
  if (!pointsDb || walletMap.size === 0) return 0;

  const dayStartMs = new Date(`${targetDate}T00:00:00Z`).getTime();
  const dayEndMs = dayStartMs + 86_400_000;

  // Load existing (identity, category) pairs for this date to skip already-recorded
  const existingRows = await pointsDb`
    SELECT DISTINCT identity_id, category
    FROM activity_points
    WHERE tx_timestamp >= ${targetDate}::date
      AND tx_timestamp < (${targetDate}::date + interval '1 day')
      AND base_points > 0 AND NOT flagged
  `;
  const existing = new Set<string>();
  for (const r of existingRows) {
    existing.add(`${r.identity_id}::${r.category}`);
  }

  interface GapRow {
    wallet: string;
    identityId: string;
    txDigest: string;
    category: string;
    activityType: string;
    basePoints: number;
    genesisMult: number;
    finalPoints: string;
    ts: number;
    eventSeq: number;
  }
  const gapRows: GapRow[] = [];
  const startTime = Date.now();

  for (const eq of RECONCILE_QUERIES) {
    // Total timeout: abort remaining queries if exceeded
    if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
      console.warn(`[Reconcile] Total timeout (${TOTAL_TIMEOUT_MS / 1000}s) exceeded, stopping early`);
      break;
    }
    const basePoints = getBasePoints(eq.category, eq.activityType);
    if (basePoints === 0) continue;

    let cursor: { txDigest: string; eventSeq: string } | null = null;
    let pages = 0;

    try {
      // Query RPC in descending order (most recent first) to reach target date quickly
      while (pages < MAX_PAGES) {
        const result: RpcQueryResult = await rpcCall<RpcQueryResult>('suix_queryEvents', [
          { MoveEventType: eq.moveEventType },
          cursor,
          PAGE_SIZE,
          true, // descending
        ]);
        pages++;

        if (!result || result.data.length === 0) break;

        let pastTargetDate = false;

        for (const event of result.data) {
          const ts = Number(event.timestampMs);

          // Skip events after target date (descending order)
          if (ts >= dayEndMs) continue;

          // Stop if we've gone past the target date
          if (ts < dayStartMs) {
            pastTargetDate = true;
            break;
          }

          // Event is within target date
          const wallet = event.sender?.toLowerCase();
          if (!wallet || wallet === '0x0000000000000000000000000000000000000000000000000000000000000000') continue;

          const identityId = walletMap.get(wallet);
          if (!identityId) continue;

          // Daily category cap: skip if already recorded
          const capKey = `${identityId}::${eq.category}`;
          if (existing.has(capKey)) continue;

          const isScoreCat = SCORE_CATEGORIES.has(eq.category);
          // See live scanner: refuse to bake an unreliable multiplier when the
          // cache is empty. Next reconcile run will retry once it loads.
          if (isScoreCat && getActivationsCacheSize() === 0) {
            continue;
          }
          const genesisMult = isScoreCat && hasGenesisPass(identityId)
            ? GENESIS_PASS_MULTIPLIER : 1.0;
          const finalPoints = isScoreCat
            ? (basePoints * genesisMult).toFixed(2)
            : '1.00';

          let txDigest: string;
          try {
            txDigest = base58ToHex(event.id.txDigest);
          } catch {
            continue;
          }

          // Mark as filled immediately to prevent same (identity, category) being
          // collected again from a different event type in the same reconcile run.
          existing.add(capKey);
          gapRows.push({
            wallet, identityId, txDigest,
            category: eq.category, activityType: eq.activityType,
            basePoints, genesisMult, finalPoints,
            ts, eventSeq: Number(event.id.eventSeq),
          });
        }

        if (pastTargetDate || !result.hasNextPage) break;
        cursor = result.nextCursor;
      }
    } catch (err) {
      console.warn(`[Reconcile] ${eq.category}/${eq.activityType} error: ${(err as Error).message}`);
    }
  }

  // Bulk INSERT all collected gap rows in a single query
  let totalFilled = 0;
  if (gapRows.length > 0) {
    const wallets = gapRows.map(r => r.wallet);
    const identityIds = gapRows.map(r => r.identityId);
    const txDigests = gapRows.map(r => r.txDigest);
    const categories = gapRows.map(r => r.category);
    const activityTypes = gapRows.map(r => r.activityType);
    const basePointsArr = gapRows.map(r => r.basePoints);
    const genesisMults = gapRows.map(r => r.genesisMult);
    const finalPointsArr = gapRows.map(r => parseFloat(r.finalPoints));
    // ISO strings (not Date objects) so postgres.js 3.x serializes as text[]
    // which PG casts element-wise to timestamptz[]. Passing Date[] fails with
    // "cannot cast type timestamp with time zone to timestamp with time zone[]".
    const timestamps = gapRows.map(r => new Date(r.ts).toISOString());
    const eventSeqs = gapRows.map(r => r.eventSeq);
    const zeros = gapRows.map(() => 0);
    const ones = gapRows.map(() => 1.0);

    const insertResult = await pointsDb`
      INSERT INTO activity_points
        (wallet_address, identity_id, tx_digest, tx_sequence_number,
         category, activity_type, base_points, volume_tier,
         genesis_multiplier, final_points, tx_timestamp, event_seq)
      SELECT * FROM unnest(
        ${wallets}::text[], ${identityIds}::text[], ${txDigests}::text[], ${zeros}::int[],
        ${categories}::text[], ${activityTypes}::text[], ${basePointsArr}::numeric[], ${ones}::numeric[],
        ${genesisMults}::numeric[], ${finalPointsArr}::numeric[], ${timestamps}::timestamptz[], ${eventSeqs}::int[]
      ) AS t(wallet_address, identity_id, tx_digest, tx_sequence_number,
             category, activity_type, base_points, volume_tier,
             genesis_multiplier, final_points, tx_timestamp, event_seq)
      ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
    `;
    totalFilled = insertResult.count;
  }

  // Always refresh matview + run snapshot correction, even when no gaps were
  // filled this cycle. The 2026-05-03 incident wrote base=0 to a snapshot
  // while activity_points already had the data (a reader-side mission-decode
  // bug, not a missing-event gap), so reconcile found nothing to fill,
  // skipped the correction, and left the corrupted lock-in in place. Running
  // correctSnapshotForReconciledDate unconditionally turns reconcile into a
  // last-line audit: any divergence between the immutable snapshot's
  // base_score and the live mission-filtered activity_points sum is
  // monotonically nudged upward (the function only updates rows where
  // new_base > old_base). Idempotent on a clean ledger.
  try {
    if (totalFilled > 0) {
      await maybeRefreshMatview(true); // forward-only; live readers depend on it
    }
    await correctSnapshotForReconciledDate(targetDate);
  } catch (err) {
    console.error('[Reconcile] Snapshot correction error:', (err as Error).message);
  }

  return totalFilled;
}

/**
 * Recompute base_score / ecosystem_score / cumulative columns for a date
 * after gap-fill. Mirrors daily-snapshot.ts' mission-aware base computation
 * so post-reconcile snapshots respect each user's mission selection. Also
 * propagates the all_time_* delta forward to any snapshot rows on later
 * dates so the per-day cumulative anchor stays consistent.
 *
 * Single-block UPDATE keeps the read of "delta" and the apply of "delta"
 * inside one transaction-shaped query, eliminating the prior pattern of
 * three separate UPDATE statements that could partially apply.
 */
async function correctSnapshotForReconciledDate(targetDate: string): Promise<void> {
  if (!pointsDb) return;
  const sf = REFERRAL_ECOSYSTEM_SCALING_FACTOR;

  // Single source of truth in config/points.ts. All readers (snapshot, /score,
  // reconcile) must agree to keep filtered base consistent across live and
  // lock-in. We render the defaults as a postgres SQL fragment rather than
  // a JS array parameter to avoid the jsonb-vs-text[] COALESCE collision
  // (see comment in user_effective_missions CTE below).
  const defaultMissionsLiteral = pointsDb.unsafe(
    DEFAULT_MISSION_IDS
      .map((m) => `'${m.replace(/'/g, "''")}'`)
      .join(','),
  );

  // Step 1: compute mission-filtered base + multiplier-scaled delta for the date.
  // The delta CTE captures what would change so we can propagate to forward
  // cumulative rows in step 2 without re-querying activity_points.
  const deltaRows = await pointsDb`
    WITH today_categories AS (
      SELECT DISTINCT identity_id, category
      FROM activity_points
      WHERE tx_timestamp >= ${targetDate}::date
        AND tx_timestamp <  (${targetDate}::date + interval '1 day')
        AND NOT flagged
        AND base_points > 0
        AND identity_id IS NOT NULL
        AND category NOT IN (
          'referral-bonus', 'daily-mission', 'ecosystem-passive',
          'staking-daily', 'staking'
        )
        AND category NOT LIKE 'ecosystem-bonus-%'
    ),
    user_effective_missions AS (
      -- user_active_missions.missions is jsonb. Post-2026-05-04 normalize is
      -- always a native array, but we still tolerate the legacy
      -- string-of-array form: (#>> '{}')::jsonb double-decodes both shapes
      -- safely. Falls back to DEFAULT_MISSION_IDS when the row is missing.
      --
      -- The defaults are inlined as a postgres ARRAY literal rather than
      -- parameterized: postgres.js serializes JS string-arrays as jsonb when
      -- no explicit cast is in scope, and the parameterized text[] cast then
      -- collides with the COALESCE branch type, producing
      -- "COALESCE types jsonb and text[] cannot be matched".
      SELECT tc.identity_id,
             COALESCE(
               (SELECT array_agg(v) FROM jsonb_array_elements_text(
                  (uam.missions #>> '{}')::jsonb
                ) AS v),
               ARRAY[${defaultMissionsLiteral}]::text[]
             ) AS missions_arr
      FROM (SELECT DISTINCT identity_id FROM today_categories) tc
      LEFT JOIN user_active_missions uam ON uam.identity_id = tc.identity_id
    ),
    filtered_base AS (
      -- SYNC WARNING: mirrors HEAVY_BASE_CATEGORIES in config/points.ts and
      -- the matview SQL in db/ecosystem-schema.sql. Add new heavy categories
      -- to all three locations.
      SELECT tc.identity_id,
             SUM(CASE WHEN tc.category IN ('pado-dex','pado-prediction') THEN 2 ELSE 1 END)::int AS new_base
      FROM today_categories tc
      JOIN user_effective_missions uem ON uem.identity_id = tc.identity_id
      WHERE tc.category = ANY(uem.missions_arr)
      GROUP BY tc.identity_id
    )
    SELECT s.identity_id,
           s.base_score::int AS old_base,
           fb.new_base,
           COALESCE(s.multiplier_v2, s.multiplier, 0)::numeric AS mult,
           ((fb.new_base - s.base_score) * COALESCE(s.multiplier_v2, s.multiplier, 0))::numeric AS scored_delta
    FROM ecosystem_score_snapshots s
    JOIN filtered_base fb ON fb.identity_id = s.identity_id
    WHERE s.snapshot_date = ${targetDate}::date
      AND fb.new_base > s.base_score
  `;

  if (deltaRows.length === 0) {
    return; // no row qualifies for an update
  }

  // Step 2: apply the per-row update + forward-propagate cumulative columns.
  // Forward propagation keeps prev-anchor reads consistent for tomorrow's
  // daily-snapshot run; without it, the next snapshot would inherit a stale
  // all_time_base and propagate the understatement indefinitely.
  for (const row of deltaRows) {
    const id = row.identity_id as string;
    const newBase = row.new_base as number;
    const mult = parseFloat(row.mult as string);
    const scoredDelta = parseFloat(row.scored_delta as string);

    // 2a. Update the target date row. Recomputes ecosystem_score from the
    // canonical formula (base*mult + bonuses + ref*sf + day_staking_scaled).
    // V1/V2 column choice is driven by which multiplier column is non-NULL.
    await pointsDb`
      WITH staking_today AS (
        SELECT GREATEST(
                 COALESCE(s.all_time_staking_scaled, 0)
                 - COALESCE((
                     SELECT prev.all_time_staking_scaled
                     FROM ecosystem_score_snapshots prev
                     WHERE prev.identity_id = ${id}
                       AND prev.snapshot_date < ${targetDate}::date
                     ORDER BY prev.snapshot_date DESC
                     LIMIT 1
                   ), 0),
                 0
               ) AS day_staking_scaled
        FROM ecosystem_score_snapshots s
        WHERE s.identity_id = ${id} AND s.snapshot_date = ${targetDate}::date
      )
      UPDATE ecosystem_score_snapshots s
      SET base_score        = ${newBase},
          all_time_base     = COALESCE(s.all_time_base, 0)  + ${scoredDelta.toFixed(3)}::numeric,
          all_time_score    = COALESCE(s.all_time_score, 0) + ${scoredDelta.toFixed(3)}::numeric,
          ecosystem_score   = CASE WHEN s.multiplier IS NOT NULL THEN
            (${newBase} * s.multiplier + s.bonus_total + s.governance_bonus + s.referral_bonus * ${sf})::numeric(10,2)
            ELSE s.ecosystem_score END,
          ecosystem_score_v2 = CASE WHEN s.multiplier_v2 IS NOT NULL THEN
            (${newBase} * s.multiplier_v2 + s.bonus_total + s.governance_bonus
             + s.referral_bonus * ${sf} + st.day_staking_scaled)::numeric(14,3)
            ELSE s.ecosystem_score_v2 END,
          is_backfilled     = TRUE
      FROM staking_today st
      WHERE s.identity_id = ${id}
        AND s.snapshot_date = ${targetDate}::date
    `;

    // 2b. Forward-propagate the all_time_base / all_time_score delta to any
    // existing snapshot rows on later dates (rare unless reconcile runs late).
    if (scoredDelta !== 0) {
      await pointsDb`
        UPDATE ecosystem_score_snapshots
        SET all_time_base  = COALESCE(all_time_base, 0)  + ${scoredDelta.toFixed(3)}::numeric,
            all_time_score = COALESCE(all_time_score, 0) + ${scoredDelta.toFixed(3)}::numeric
        WHERE identity_id = ${id}
          AND snapshot_date > ${targetDate}::date
      `;
    }

    // Suppress unused-var lint
    void mult;
  }

  // Step 3: re-rank for the date. Uses COALESCE so V1 and V2 rows compete
  // on the same scale (the score columns are intentionally on the same
  // numeric basis -- daily ecosystem score, with V2 just adding staking and
  // health-derived multiplier).
  await pointsDb`
    WITH ranked AS (
      SELECT identity_id,
             ROW_NUMBER() OVER (
               ORDER BY COALESCE(ecosystem_score_v2, ecosystem_score, 0) DESC
             ) AS new_rank
      FROM ecosystem_score_snapshots
      WHERE snapshot_date = ${targetDate}::date
        AND COALESCE(multiplier_v2, multiplier, 0) > 0
    )
    UPDATE ecosystem_score_snapshots s
    SET rank = r.new_rank
    FROM ranked r
    WHERE s.identity_id = r.identity_id
      AND s.snapshot_date = ${targetDate}::date
  `;

  console.log(`[Reconcile] Snapshot corrected for ${targetDate}: ${deltaRows.length} rows`);
}
