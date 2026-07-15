/**
 * GoStop Lottery Keeper Configuration
 *
 * Constants, transaction builders, and helper functions for the gostop
 * lottery keeper bot. Self-contained.
 *
 * Differences from Pado lottery keeper:
 *   - settle_round signature now requires LotteryRegistry, BankrollPool,
 *     and Clock arguments (treasury flows directly to bankroll on settle).
 *   - Schedule: close every Sunday 24:00 UTC == Monday 00:00 UTC, draw
 *     immediately after (LOTTERY_DRAW_OFFSET_MS=0 default).
 */

import { SuiClient } from '@mysten/sui/client';
import postgres from 'postgres';
import { Transaction } from '@mysten/sui/transactions';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withRetry } from './retry.js';

// ========================================
// Single source of truth: apps/gostop/devnet-ids.json
// Env vars are still respected as overrides (post-upgrade or staging).
// ========================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const devnetIds = JSON.parse(
  readFileSync(join(__dirname, '../../devnet-ids.json'), 'utf8'),
) as {
  rpc: string;
  lottery: {
    packageId: string;
    originalPackageId?: string;
    registry: string;
    adminCap: string;
  };
  bankrollPool: { bankrollPool: string };
};

// ========================================
// Network
// ========================================

export const RPC_URL = process.env.NASUN_RPC_URL || devnetIds.rpc;
export const FAUCET_URL = process.env.NASUN_FAUCET_URL || 'https://faucet.devnet.nasun.io';

// ========================================
// Lottery Contract IDs
// ========================================

export const LOTTERY_PACKAGE_ID =
  process.env.LOTTERY_PACKAGE_ID || devnetIds.lottery.packageId;

// Original package ID for event type queries (immutable across upgrades).
export const LOTTERY_ORIGINAL_PACKAGE_ID =
  process.env.LOTTERY_ORIGINAL_PACKAGE_ID ||
  devnetIds.lottery.originalPackageId ||
  devnetIds.lottery.packageId;

export const LOTTERY_REGISTRY_ID =
  process.env.LOTTERY_REGISTRY_ID || devnetIds.lottery.registry;

export const LOTTERY_ADMIN_CAP_ID =
  process.env.LOTTERY_ADMIN_CAP_ID || devnetIds.lottery.adminCap;

export const BANKROLL_POOL_ID =
  process.env.BANKROLL_POOL_ID || devnetIds.bankrollPool.bankrollPool;

export const CLOCK_ID = '0x6';
export const SUI_RANDOM_ID = '0x8';

// ========================================
// Round Status
// ========================================

export const ROUND_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  DRAWN: 2,
  SETTLED: 3,
} as const;

// ========================================
// Weekly Schedule (env overrides)
// ========================================

// Defaults: close on Monday 00:00 UTC, draw immediately. So if the keeper
// catches a SETTLED state on, say, Monday 00:00:30 UTC, the new round will
// be created immediately and closed at next Monday 00:00 UTC.
export const ROUND_CLOSE_DAY = Number(process.env.LOTTERY_CLOSE_DAY ?? 1); // 1=Monday
export const ROUND_CLOSE_HOUR = Number(process.env.LOTTERY_CLOSE_HOUR ?? 0);
export const ROUND_DRAW_OFFSET_MS = Number(process.env.LOTTERY_DRAW_OFFSET_MS ?? 0);

// ========================================
// Types
// ========================================

export interface LotteryRound {
  id: string;
  roundNumber: number;
  status: number;
  startTime: number;
  closeTime: number;
  drawTime: number;
  prizePool: bigint;
  rolloverIn: bigint;
  drawnNumbers: number[] | null;
  ticketCount: number;
  /** UID of the round's `tickets_by_address` Table; parent for buyer enumeration. */
  ticketsTableId: string;
  totalSales: bigint;
  tier1Winners: number;
  tier2Winners: number;
  tier3Winners: number;
  tier1PayoutPerWinner: bigint;
  tier2PayoutPerWinner: bigint;
  tier3PayoutPerWinner: bigint;
  tier1RolloverOut: bigint;
  tier2RolloverOut: bigint;
  tier3RolloverOut: bigint;
}

export interface WinnerCounts {
  tier1: number;
  tier2: number;
  tier3: number;
  totalFetched: number;
}

// ========================================
// Transaction Builders
// ========================================

export function buildCloseRoundPermissionlessTx(roundId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::close_round_permissionless`,
    arguments: [tx.object(roundId), tx.object(CLOCK_ID)],
  });
  return tx;
}

export function buildDrawNumbersPermissionlessTx(roundId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::draw_numbers_permissionless`,
    arguments: [tx.object(roundId), tx.object(SUI_RANDOM_ID), tx.object(CLOCK_ID)],
  });
  return tx;
}

export function buildSettleRoundTx(
  roundId: string,
  adminCapId: string,
  tier1: number,
  tier2: number,
  tier3: number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::settle_round`,
    arguments: [
      tx.object(adminCapId),
      tx.object(roundId),
      tx.object(LOTTERY_REGISTRY_ID),
      tx.object(BANKROLL_POOL_ID),
      tx.pure.u64(tier1),
      tx.pure.u64(tier2),
      tx.pure.u64(tier3),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function buildCreateRoundTx(
  adminCapId: string,
  closeTime: number,
  drawTime: number,
  rolloverAmount: bigint,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::create_round`,
    arguments: [
      tx.object(adminCapId),
      tx.object(LOTTERY_REGISTRY_ID),
      tx.pure.u64(closeTime),
      tx.pure.u64(drawTime),
      tx.pure.u64(rolloverAmount),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function buildTransferRolloverTx(
  fromRoundId: string,
  toRoundId: string,
  adminCapId: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${LOTTERY_PACKAGE_ID}::lottery::transfer_rollover`,
    arguments: [
      tx.object(adminCapId),
      tx.object(fromRoundId),
      tx.object(toRoundId),
    ],
  });
  return tx;
}

// ========================================
// Helpers
// ========================================

export function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export async function fetchRound(
  client: SuiClient,
  roundId: string,
): Promise<LotteryRound | null> {
  const obj = await client.getObject({
    id: roundId,
    options: { showContent: true },
  });

  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;

  const fields = obj.data.content.fields as Record<string, any>;
  const drawnRaw = fields.drawn_numbers;
  let drawnNumbers: number[] | null = null;
  if (drawnRaw && drawnRaw.type?.includes('Option') && drawnRaw.fields?.vec) {
    const vec = drawnRaw.fields.vec;
    if (Array.isArray(vec) && vec.length > 0) {
      drawnNumbers = vec[0].map(Number);
    }
  } else if (Array.isArray(drawnRaw)) {
    drawnNumbers = drawnRaw.map(Number);
  }

  // prize_pool is Balance<NUSDC>; SDK serializes as plain number string in 1.45.
  let prizePool = 0n;
  const pp = fields.prize_pool;
  if (pp != null) {
    if (typeof pp === 'object' && pp.fields?.value != null) {
      prizePool = BigInt(pp.fields.value);
    } else {
      prizePool = BigInt(pp.toString());
    }
  }

  return {
    id: obj.data.objectId,
    roundNumber: Number(fields.round_number),
    status: Number(fields.status),
    startTime: Number(fields.start_time),
    closeTime: Number(fields.close_time),
    drawTime: Number(fields.draw_time),
    prizePool,
    rolloverIn: BigInt(fields.rollover_in),
    drawnNumbers,
    ticketCount: Number(fields.ticket_count),
    ticketsTableId: fields.tickets_by_address?.fields?.id?.id ?? '',
    totalSales: BigInt(fields.total_sales),
    tier1Winners: Number(fields.tier1_winners),
    tier2Winners: Number(fields.tier2_winners),
    tier3Winners: Number(fields.tier3_winners),
    tier1PayoutPerWinner: BigInt(fields.tier1_payout_per_winner),
    tier2PayoutPerWinner: BigInt(fields.tier2_payout_per_winner),
    tier3PayoutPerWinner: BigInt(fields.tier3_payout_per_winner),
    tier1RolloverOut: BigInt(fields.tier1_rollover_out),
    tier2RolloverOut: BigInt(fields.tier2_rollover_out),
    tier3RolloverOut: BigInt(fields.tier3_rollover_out),
  };
}

/**
 * Find the current/latest round WITHOUT queryEvents. The devnet fullnode prunes
 * transaction events after a couple of epochs (~4h), so
 * queryEvents(RoundCreated) throws "Could not find the referenced transaction
 * events" once the round's create tx ages out. That stalled the keeper for days
 * on round 3 (29k+ consecutive failures, a 24,449-ticket draw left overdue).
 * queryTransactionBlocks degrades gracefully instead of throwing, and the newest
 * create_round tx is always recent (weekly cycle) so it stays within tx-index
 * retention. We read the created shared LotteryRound straight from its effects.
 */
export async function fetchLatestRound(
  client: SuiClient,
): Promise<LotteryRound | null> {
  const txs = await withRetry(
    () =>
      client.queryTransactionBlocks({
        filter: {
          MoveFunction: {
            package: LOTTERY_PACKAGE_ID,
            module: 'lottery',
            function: 'create_round',
          },
        },
        options: { showEffects: true },
        order: 'descending',
        limit: 1,
      }),
    { label: 'queryCreateRoundTx' },
  );

  const created = txs.data[0]?.effects?.created ?? [];
  const roundRef = created.find(
    (c) => c.owner && typeof c.owner === 'object' && 'Shared' in c.owner,
  );
  if (!roundRef) return null;

  return withRetry(() => fetchRound(client, roundRef.reference.objectId), { label: 'fetchRound' });
}

/**
 * Count winners from the durable indexer table `gostop.lottery_ticket`, NOT
 * from TicketPurchased events. The devnet fullnode prunes tx events after ~2
 * epochs (~4h), so the old queryEvents scan threw "Could not find the
 * referenced transaction events" on any round older than a few hours — which
 * left Round 3 (24,449 tickets) unsettleable and stalled the keeper for days.
 * The indexer (gostop-backend) captures every TicketPurchased into
 * gostop.lottery_ticket before pruning, so it is the durable source of truth.
 *
 * The indexer keys tickets by `round_number`, which pre-v8 rounds reused after
 * the fresh genesis. Isolate THIS round's tickets by
 * `purchase_ts_ms >= round.startTime` (a pre-v8 round with the same number was
 * bought strictly before this round opened). Verified against Round 3's live
 * settlement: drawn {4,10,18,24,25} -> tier2=38, tier3=883, total 24449.
 *
 * The keeper cross-checks `totalFetched` against the on-chain ticket_count and
 * retries on a shortfall (indexer lag) before settling, so a briefly-behind
 * indexer defers settlement rather than under-paying.
 */
let _lotteryDb: ReturnType<typeof postgres> | null = null;
function lotteryDb(): ReturnType<typeof postgres> {
  if (_lotteryDb) return _lotteryDb;
  const url = process.env.GOSTOP_LOTTERY_DB_URL;
  if (!url) {
    throw new Error('GOSTOP_LOTTERY_DB_URL is required for winner counting (durable ticket source)');
  }
  _lotteryDb = postgres(url, {
    max: 2,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { statement_timeout: 30_000 },
  });
  return _lotteryDb;
}

export async function countWinners(
  roundNumber: number,
  drawnNumbers: number[],
  roundStartTime: number,
): Promise<WinnerCounts> {
  if (
    drawnNumbers.length !== 5 ||
    drawnNumbers.some((n) => !Number.isInteger(n) || n < 1 || n > 25)
  ) {
    throw new Error(`invalid drawn numbers: ${JSON.stringify(drawnNumbers)}`);
  }
  const db = lotteryDb();
  const rows = await db<{ tier1: number; tier2: number; tier3: number; total: number }[]>`
    WITH w AS (
      SELECT (
        SELECT count(*) FROM unnest(numbers) x WHERE x = ANY(${drawnNumbers}::int[])
      ) AS m
      FROM gostop.lottery_ticket
      WHERE round_number = ${roundNumber} AND purchase_ts_ms >= ${roundStartTime}
    )
    SELECT
      count(*) FILTER (WHERE m = 5)::int AS tier1,
      count(*) FILTER (WHERE m = 4)::int AS tier2,
      count(*) FILTER (WHERE m = 3)::int AS tier3,
      count(*)::int AS total
    FROM w`;
  const r = rows[0];
  return { tier1: r.tier1, tier2: r.tier2, tier3: r.tier3, totalFetched: r.total };
}

function normalizeSuiId(id: unknown): string {
  const hex = String(id ?? '').toLowerCase().replace(/^0x/, '');
  return '0x' + hex.padStart(64, '0');
}

/**
 * Reconstruct winner counts directly from live on-chain Ticket objects, without
 * the indexer DB. Every ticket is an owned `Ticket` object that persists in the
 * object store (only tx *events* are pruned after ~4h, not object state), and the
 * round's `tickets_by_address` Table enumerates every buyer. So even when the
 * indexer missed a ticket burst and its TicketPurchased events have since been
 * pruned (leaving countWinners permanently short of chain ticket_count and the
 * round stuck in DRAWN), we can still count winners exactly from chain.
 *
 * Isolation is by `round_id` (the round object's ID), NOT round_number: pre-v8
 * rounds reuse round numbers, and a single buyer can hold tickets from several
 * rounds (verified live: one address held both round 4 and an earlier round).
 *
 * Heavier than the DB path (one getOwnedObjects per buyer), so the keeper only
 * falls back to it when the DB shortfall persists. The caller must still gate on
 * `totalFetched >= ticketCount`; a shortfall here means some tickets were
 * transferred out of the buyer set, and settlement should defer rather than
 * under-pay.
 */
export async function countWinnersOnChain(
  client: SuiClient,
  round: LotteryRound,
): Promise<WinnerCounts> {
  if (!round.drawnNumbers || round.drawnNumbers.length !== 5) {
    throw new Error('countWinnersOnChain requires 5 drawn numbers');
  }
  if (!round.ticketsTableId) {
    throw new Error('countWinnersOnChain requires round.ticketsTableId');
  }
  const drawn = new Set(round.drawnNumbers);
  const ticketType = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::Ticket`;
  const roundId = normalizeSuiId(round.id);

  // 1) Enumerate every buyer address from the round's tickets_by_address Table.
  const buyers: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await withRetry(
      () => client.getDynamicFields({ parentId: round.ticketsTableId, cursor, limit: 50 }),
      { label: 'ticketsByAddress.getDynamicFields' },
    );
    for (const f of page.data) {
      const v = (f.name as { value?: unknown })?.value;
      if (typeof v === 'string') buyers.push(v);
    }
    cursor = page.hasNextPage ? page.nextCursor ?? null : null;
  } while (cursor);

  // 2) For each buyer, tally their Ticket objects belonging to THIS round.
  // Per-buyer tallies are independent, so run a bounded-concurrency pool: with
  // ~5000 buyers a fully sequential pass takes many minutes against devnet RPC
  // and would block the keeper tick. Concurrency stays modest to be gentle on
  // the public fullnode.
  const tallyBuyer = async (owner: string) => {
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    let n = 0;
    let oCursor: string | null = null;
    do {
      const page = await withRetry(
        () =>
          client.getOwnedObjects({
            owner,
            filter: { StructType: ticketType },
            options: { showContent: true },
            cursor: oCursor,
            limit: 50,
          }),
        { label: 'ticket.getOwnedObjects' },
      );
      for (const o of page.data) {
        const content = o.data?.content;
        if (!content || content.dataType !== 'moveObject') continue;
        const fields = content.fields as Record<string, any>;
        if (normalizeSuiId(fields.round_id) !== roundId) continue;
        const nums = Array.isArray(fields.numbers) ? fields.numbers.map(Number) : [];
        let m = 0;
        for (const num of nums) if (drawn.has(num)) m++;
        if (m === 5) t1++;
        else if (m === 4) t2++;
        else if (m === 3) t3++;
        n++;
      }
      oCursor = page.hasNextPage ? page.nextCursor ?? null : null;
    } while (oCursor);
    return { t1, t2, t3, n };
  };

  let tier1 = 0;
  let tier2 = 0;
  let tier3 = 0;
  let total = 0;
  const CONCURRENCY = 25;
  for (let i = 0; i < buyers.length; i += CONCURRENCY) {
    const batch = buyers.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(tallyBuyer));
    for (const r of results) {
      tier1 += r.t1;
      tier2 += r.t2;
      tier3 += r.t3;
      total += r.n;
    }
  }

  return { tier1, tier2, tier3, totalFetched: total };
}

export function calculateNextRoundTimes(): { closeTime: number; drawTime: number } {
  const now = new Date();
  const currentDay = now.getUTCDay();

  let daysUntilClose = (ROUND_CLOSE_DAY - currentDay + 7) % 7;
  if (daysUntilClose === 0) {
    if (now.getUTCHours() >= ROUND_CLOSE_HOUR) {
      daysUntilClose = 7;
    }
  }

  const closeDate = new Date(now);
  closeDate.setUTCDate(closeDate.getUTCDate() + daysUntilClose);
  closeDate.setUTCHours(ROUND_CLOSE_HOUR, 0, 0, 0);

  const closeTime = closeDate.getTime();
  const drawTime = closeTime + ROUND_DRAW_OFFSET_MS;

  return { closeTime, drawTime };
}

export async function requestGas(address: string): Promise<boolean> {
  const body = JSON.stringify({ FixedAmountRequest: { recipient: address } });
  const headers = { 'Content-Type': 'application/json' };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${FAUCET_URL}/v1/gas`, { method: 'POST', headers, body });
      if (res.ok) {
        console.log(`[${timestamp()}] Received gas from faucet`);
        await new Promise((r) => setTimeout(r, 3000));
        return true;
      }
      if (res.status === 429) {
        const wait = 5000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
    } catch {
      /* retry */
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}
