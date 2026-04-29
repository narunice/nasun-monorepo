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
  prediction: '0x98765cc3765324148db9815da8bce85e6ca895e94eed910b6cc9bec55cc22895',
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
  // Prediction
  { moveEventType: `${PKG.prediction}::prediction::TokensMinted`, category: 'pado-prediction', activityType: 'mint-tokens' },
  { moveEventType: `${PKG.prediction}::prediction::BidPlaced`, category: 'pado-prediction', activityType: 'place-bid' },
  { moveEventType: `${PKG.prediction}::prediction::AskPlaced`, category: 'pado-prediction', activityType: 'place-ask' },
  { moveEventType: `${PKG.prediction}::prediction::WinningsClaimed`, category: 'pado-prediction', activityType: 'claim-winnings' },
  // Lottery
  { moveEventType: `${PKG.lottery}::lottery::TicketPurchased`, category: 'pado-lottery', activityType: 'buy-ticket' },
  { moveEventType: `${PKG.lottery}::lottery::PrizeClaimed`, category: 'pado-lottery', activityType: 'claim-prize' },
  // Gostop Lottery (same category as pado — daily cap dedups)
  { moveEventType: `${PKG.gostopLottery}::lottery::TicketPurchased`, category: 'pado-lottery', activityType: 'buy-ticket' },
  { moveEventType: `${PKG.gostopLottery}::lottery::PrizeClaimed`, category: 'pado-lottery', activityType: 'claim-prize' },
  // Perp
  { moveEventType: `${PKG.perp}::perp::PositionOpened`, category: 'pado-perp', activityType: 'open-position' },
  { moveEventType: `${PKG.perp}::perp::PositionClosed`, category: 'pado-perp', activityType: 'close-position' },
  { moveEventType: `${PKG.perp}::perp::MarginAdded`, category: 'pado-perp', activityType: 'add-margin' },
  { moveEventType: `${PKG.perp}::perp::MarginRemoved`, category: 'pado-perp', activityType: 'remove-margin' },
  // Scratchcard
  { moveEventType: `${PKG.scratchcard}::scratchcard::ScratchCardPurchased`, category: 'pado-scratchcard', activityType: 'scratchcard-purchase' },
  { moveEventType: `${PKG.gostopScratchcard}::scratchcard::ScratchCardPurchased`, category: 'pado-scratchcard', activityType: 'scratchcard-purchase' },
  // NumberMatch (Games)
  { moveEventType: `${PKG.numbermatch}::numbermatch::NumberMatchPlayed`, category: 'pado-games', activityType: 'numbermatch-play' },
  { moveEventType: `${PKG.gostopNumbermatch}::numbermatch::NumberMatchPlayed`, category: 'pado-games', activityType: 'numbermatch-play' },
  // Gostop Mines (all SessionFinished events count, bust + cashout)
  { moveEventType: `${PKG.gostopMines}::mines::SessionFinished`, category: 'pado-games', activityType: 'mines-session' },
  // Gostop Crash (CashOutRecorded fires on successful cashouts only)
  { moveEventType: `${PKG.gostopCrash}::crash::CashOutRecorded`, category: 'pado-games', activityType: 'crash-cashout' },
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

(function verifyReconcileSync(): void {
  const reconcileSet = new Set(RECONCILE_QUERIES.map((q) => q.moveEventType));
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

  // If gaps were found, refresh matview and correct the snapshot
  if (totalFilled > 0) {
    try {
      await maybeRefreshMatview(true); // force refresh

      // Correct snapshot: only UPDATE where matview > snapshot (new activities found)
      await pointsDb`
        WITH new_scores AS (
          SELECT identity_id, base_score::int as new_base
          FROM ecosystem_daily_scores
          WHERE day = ${targetDate}::date
        )
        UPDATE ecosystem_score_snapshots s
        SET base_score = ns.new_base,
            ecosystem_score = (ns.new_base * s.multiplier + s.bonus_total + s.governance_bonus + s.referral_bonus * ${REFERRAL_ECOSYSTEM_SCALING_FACTOR})::numeric(10,2),
            is_backfilled = TRUE
        FROM new_scores ns
        WHERE s.identity_id = ns.identity_id
          AND s.snapshot_date = ${targetDate}::date
          AND s.base_score < ns.new_base
      `;

      // Insert snapshot rows for users who had no snapshot at all
      await pointsDb`
        INSERT INTO ecosystem_score_snapshots
          (identity_id, snapshot_date, base_score, multiplier, bonus_total,
           referral_bonus, governance_bonus, ecosystem_score, is_penalized, rank, is_backfilled)
        SELECT
          d.identity_id, ${targetDate}::date, d.base_score::int,
          COALESCE(
            (SELECT s2.multiplier FROM ecosystem_score_snapshots s2
             WHERE s2.identity_id = d.identity_id AND s2.multiplier > 0
             ORDER BY ABS(s2.snapshot_date - ${targetDate}::date) LIMIT 1),
            0
          ),
          0, 0, 0, 0, FALSE, NULL, TRUE
        FROM ecosystem_daily_scores d
        LEFT JOIN ecosystem_score_snapshots s
          ON d.identity_id = s.identity_id AND s.snapshot_date = ${targetDate}::date
        WHERE d.day = ${targetDate}::date AND s.identity_id IS NULL
      `;

      // Recalculate ecosystem_score for newly inserted rows
      await pointsDb`
        UPDATE ecosystem_score_snapshots
        SET ecosystem_score = (base_score * multiplier + bonus_total + governance_bonus + referral_bonus * ${REFERRAL_ECOSYSTEM_SCALING_FACTOR})::numeric(10,2)
        WHERE snapshot_date = ${targetDate}::date AND is_backfilled = TRUE AND ecosystem_score = 0 AND base_score > 0
      `;

      // Re-rank
      await pointsDb`
        WITH ranked AS (
          SELECT identity_id, ROW_NUMBER() OVER (ORDER BY ecosystem_score DESC) as new_rank
          FROM ecosystem_score_snapshots
          WHERE snapshot_date = ${targetDate}::date AND multiplier > 0
        )
        UPDATE ecosystem_score_snapshots s
        SET rank = r.new_rank
        FROM ranked r
        WHERE s.identity_id = r.identity_id AND s.snapshot_date = ${targetDate}::date
      `;
    } catch (err) {
      console.error('[Reconcile] Snapshot correction error:', (err as Error).message);
    }
  }

  return totalFilled;
}
