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

import { SuiClient, type EventId } from '@mysten/sui/client';
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

export async function fetchLatestRound(
  client: SuiClient,
): Promise<LotteryRound | null> {
  const events = await withRetry(
    () =>
      client.queryEvents({
        query: {
          MoveEventType: `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::RoundCreated`,
        },
        order: 'descending',
        limit: 1,
      }),
    { label: 'queryRoundCreated' },
  );

  if (events.data.length === 0) return null;

  const roundId = (events.data[0].parsedJson as any).round_id;
  return withRetry(() => fetchRound(client, roundId), { label: 'fetchRound' });
}

/**
 * Count winners by paginating TicketPurchased events DESCENDING from now,
 * stopping once we've passed the round's start_time. This avoids the O(N²)
 * scan from genesis that grows unbounded with cumulative rounds.
 *
 * Caller must pass `roundStartTime` (round.startTime ms) so we can early-out.
 * As an extra safety net, we cap at MAX_PAGES to avoid runaway loops if
 * the RPC returns events without timestampMs.
 */
const MAX_PAGES = 200; // 50 events × 200 pages = 10,000 ticket events
const SAFETY_LOOKBACK_MS = 30 * 60 * 1000; // 30 min before round.startTime

export async function countWinners(
  client: SuiClient,
  roundId: string,
  drawnNumbers: number[],
  roundStartTime: number,
): Promise<WinnerCounts> {
  const drawnSet = new Set(drawnNumbers);
  let tier1 = 0,
    tier2 = 0,
    tier3 = 0;
  let totalFetched = 0;
  let cursor: EventId | null | undefined = undefined;
  const cutoffMs = roundStartTime - SAFETY_LOOKBACK_MS;

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await withRetry(
      () =>
        client.queryEvents({
          query: {
            MoveEventType: `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::TicketPurchased`,
          },
          cursor: cursor ?? undefined,
          limit: 50,
          order: 'descending',
        }),
      { label: 'queryTicketPurchased' },
    );

    let pastCutoff = false;
    for (const event of response.data) {
      const tsMs = Number(event.timestampMs ?? 0);
      if (tsMs && tsMs < cutoffMs) {
        pastCutoff = true;
        break;
      }
      const parsed = event.parsedJson as { round_id: string; numbers: unknown };
      if (parsed.round_id !== roundId) continue;

      const numbers: number[] = (parsed.numbers as unknown[]).map(Number);
      const matches = numbers.filter((n) => drawnSet.has(n)).length;
      if (matches === 5) tier1++;
      else if (matches === 4) tier2++;
      else if (matches === 3) tier3++;
      totalFetched++;
    }

    if (pastCutoff) break;
    if (!response.hasNextPage) break;
    cursor = response.nextCursor;
  }

  return { tier1, tier2, tier3, totalFetched };
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
