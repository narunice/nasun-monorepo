/**
 * Lottery Keeper Configuration
 *
 * Constants, transaction builders, and helper functions for the lottery keeper bot.
 * Self-contained (no dependency on frontend packages or LP bot config).
 */

import { SuiClient, EventId } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { withRetry } from './retry.js';

// ========================================
// Network
// ========================================

export const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
export const FAUCET_URL = process.env.NASUN_FAUCET_URL || 'https://faucet.devnet.nasun.io';

// ========================================
// Lottery Contract IDs (env overrides for post-upgrade)
// ========================================

export const LOTTERY_PACKAGE_ID =
  process.env.LOTTERY_PACKAGE_ID ||
  '0xeb5af6c536464672cc6975b07957ff222037c724a4f2810b0cd295bb8b4304da';

// Original package ID for event type queries (immutable across upgrades)
export const LOTTERY_ORIGINAL_PACKAGE_ID =
  process.env.LOTTERY_ORIGINAL_PACKAGE_ID ||
  '0xeb79d7421090eccc5f912f20407c67b8052c7fbe1efea39bf9b548ccea46819c';

export const LOTTERY_REGISTRY_ID =
  process.env.LOTTERY_REGISTRY_ID ||
  '0x8a0d95d3bfb3d9771d333673e3d1943dfe2c31b7c8dc3ef6c1310fe0f3317ae5';

export const LOTTERY_ADMIN_CAP_ID =
  process.env.LOTTERY_ADMIN_CAP_ID ||
  '0x20e79c01aa862fbf0273dfb2b769feb0f87ac07f3788478115efb6f2d3a33c71';

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

// Weekly cycle: opens ~Sunday 00:00 UTC, closes Saturday 22:00 UTC, draws Saturday 23:00 UTC
// Settle + create happens ~23:05 UTC, so the next round starts just before Sunday midnight.
export const ROUND_CLOSE_DAY = Number(process.env.LOTTERY_CLOSE_DAY ?? 6); // 6=Saturday
export const ROUND_CLOSE_HOUR = Number(process.env.LOTTERY_CLOSE_HOUR ?? 22);
export const ROUND_DRAW_OFFSET_MS = Number(process.env.LOTTERY_DRAW_OFFSET_MS ?? 3_600_000); // 1 hour after close

// ========================================
// Types
// ========================================

export interface LotteryRound {
  id: string;
  roundNumber: number;
  status: number;
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
      tx.pure.u64(tier1),
      tx.pure.u64(tier2),
      tx.pure.u64(tier3),
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

/** Fetch and parse a LotteryRound object from chain */
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

  return {
    id: obj.data.objectId,
    roundNumber: Number(fields.round_number),
    status: Number(fields.status),
    closeTime: Number(fields.close_time),
    drawTime: Number(fields.draw_time),
    prizePool: BigInt(fields.prize_pool),
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

/** Discover the latest round by querying RoundCreated events (most recent first) */
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
 * Resolve a round by its sequential number via RoundCreated events (newest
 * first, bounded). Rounds are created in order, so a recent target sits near the
 * top; the page bound keeps the scan away from prunable history.
 */
export async function fetchRoundByNumber(
  client: SuiClient,
  roundNumber: number,
): Promise<LotteryRound | null> {
  let cursor: EventId | null | undefined = undefined;
  // Small descending pages: queryEvents fails atomically if any event in the
  // requested page references a pruned tx, so a wide page would break the moment
  // it reached an old round. A 2-wide window keeps each page within recent,
  // un-pruned history; on the reconcile path the target (the immediately prior
  // round) is found on the first page.
  for (let page = 0; page < 6; page++) {
    let events;
    try {
      events = await withRetry(
        () =>
          client.queryEvents({
            query: {
              MoveEventType: `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::RoundCreated`,
            },
            cursor: cursor ?? undefined,
            limit: 2,
            order: 'descending',
          }),
        { label: 'queryRoundCreated' },
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Paged back into pruned history without finding the round: give up
      // gracefully (caller treats a null as "nothing to reconcile").
      if (msg.includes('Could not find the referenced transaction')) return null;
      throw error;
    }

    for (const ev of events.data) {
      const pj = ev.parsedJson as any;
      if (Number(pj.round_number) === roundNumber) {
        return withRetry(() => fetchRound(client, pj.round_id), { label: 'fetchRound' });
      }
    }

    if (!events.hasNextPage) break;
    cursor = events.nextCursor;
  }
  return null;
}

/**
 * Count winners by querying TicketPurchased events and matching against drawn numbers.
 * Uses full cursor-based pagination with ticket_count cross-check.
 */
export async function countWinners(
  client: SuiClient,
  roundId: string,
  drawnNumbers: number[],
  expectedTicketCount: number,
): Promise<WinnerCounts> {
  const drawnSet = new Set(drawnNumbers);
  let tier1 = 0,
    tier2 = 0,
    tier3 = 0;
  let totalFetched = 0;
  let cursor: EventId | null | undefined = undefined;

  // Paginate DESCENDING (newest first) and stop once we have collected every
  // ticket of the target round (expectedTicketCount = on-chain ticket_count,
  // the authoritative tally). The devnet fullnode prunes old transactions, so a
  // genesis-up ascending scan fails the instant the oldest TicketPurchased event
  // references a pruned tx. The round being settled is always recent, so reading
  // newest-first and stopping at the on-chain count never descends into pruned
  // history.
  while (totalFetched < expectedTicketCount) {
    let response;
    try {
      response = await withRetry(
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Reached pruned history before collecting every ticket. Return the
      // partial tally; the caller verifies totalFetched === ticket_count and
      // skips settlement on any shortfall rather than under-paying winners.
      if (msg.includes('Could not find the referenced transaction')) {
        console.warn(
          `[lottery] TicketPurchased history pruned mid-scan (fetched ${totalFetched}/${expectedTicketCount} for round ${roundId}): ${msg}`,
        );
        break;
      }
      throw error;
    }

    for (const event of response.data) {
      const parsed = event.parsedJson as any;
      if (parsed.round_id !== roundId) continue;

      const numbers: number[] = parsed.numbers.map(Number);
      const matches = numbers.filter((n) => drawnSet.has(n)).length;
      if (matches === 5) tier1++;
      else if (matches === 4) tier2++;
      else if (matches === 3) tier3++;
      totalFetched++;
    }

    if (!response.hasNextPage) break;
    cursor = response.nextCursor;
  }

  return { tier1, tier2, tier3, totalFetched };
}

/** Calculate next round close/draw times based on weekly schedule */
export function calculateNextRoundTimes(): { closeTime: number; drawTime: number } {
  const now = new Date();
  const currentDay = now.getUTCDay(); // 0=Sunday

  // Find next occurrence of ROUND_CLOSE_DAY at ROUND_CLOSE_HOUR UTC
  let daysUntilClose = (ROUND_CLOSE_DAY - currentDay + 7) % 7;
  if (daysUntilClose === 0) {
    // Same day: only if we haven't passed the close hour yet
    if (now.getUTCHours() >= ROUND_CLOSE_HOUR) {
      daysUntilClose = 7; // Next week
    }
  }

  const closeDate = new Date(now);
  closeDate.setUTCDate(closeDate.getUTCDate() + daysUntilClose);
  closeDate.setUTCHours(ROUND_CLOSE_HOUR, 0, 0, 0);

  const closeTime = closeDate.getTime();
  const drawTime = closeTime + ROUND_DRAW_OFFSET_MS;

  return { closeTime, drawTime };
}

/** Gas faucet request (inlined to avoid LP bot config dependency) */
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
    } catch { /* retry */ }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}
