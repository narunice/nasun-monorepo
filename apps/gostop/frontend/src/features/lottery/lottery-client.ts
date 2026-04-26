import { getSuiClient } from '../../lib/sui-client';
import {
  LOTTERY_REGISTRY_ID,
  ROUND_CREATED_EVENT_TYPE,
  ROUND_STATUS,
  TICKET_TYPE,
  type RoundStatus,
} from '../../lib/gostop-config';

export interface LotteryRegistry {
  id: string;
  currentRound: number;
  nextTicketId: number;
}

export interface LotteryRound {
  id: string;
  roundNumber: number;
  status: RoundStatus;
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

export interface Ticket {
  id: string;
  ticketId: number;
  roundId: string;
  roundNumber: number;
  owner: string;
  numbers: number[];
  purchaseTime: number;
}

export async function fetchLotteryRegistry(): Promise<LotteryRegistry | null> {
  const client = getSuiClient();
  try {
    const obj = await client.getObject({
      id: LOTTERY_REGISTRY_ID,
      options: { showContent: true },
    });
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
    const f = obj.data.content.fields as Record<string, unknown>;
    return {
      id: LOTTERY_REGISTRY_ID,
      currentRound: Number(f.current_round || 0),
      nextTicketId: Number(f.next_ticket_id || 1),
    };
  } catch (e) {
    console.error('[lottery] fetchLotteryRegistry:', e);
    return null;
  }
}

export async function fetchLotteryRound(roundId: string): Promise<LotteryRound | null> {
  const client = getSuiClient();
  try {
    const obj = await client.getObject({
      id: roundId,
      options: { showContent: true },
    });
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
    return parseRoundFields(roundId, obj.data.content.fields as Record<string, unknown>);
  } catch (e) {
    console.error('[lottery] fetchLotteryRound:', e);
    return null;
  }
}

/**
 * Find the most recent RoundCreated event and return that round id. Returns
 * null if no rounds have been created yet.
 */
export async function fetchLatestRoundId(): Promise<string | null> {
  const client = getSuiClient();
  try {
    const events = await client.queryEvents({
      query: { MoveEventType: ROUND_CREATED_EVENT_TYPE },
      limit: 1,
      order: 'descending',
    });
    if (events.data.length === 0) return null;
    const p = events.data[0].parsedJson as { round_id: string };
    return p.round_id;
  } catch (e) {
    console.error('[lottery] fetchLatestRoundId:', e);
    return null;
  }
}

export async function fetchLatestRound(): Promise<LotteryRound | null> {
  const id = await fetchLatestRoundId();
  if (!id) return null;
  return fetchLotteryRound(id);
}

export async function fetchUserTickets(
  owner: string,
  roundId?: string,
): Promise<Ticket[]> {
  const client = getSuiClient();
  try {
    const tickets: Ticket[] = [];
    let cursor: string | null | undefined = null;
    do {
      const resp = await client.getOwnedObjects({
        owner,
        filter: { StructType: TICKET_TYPE },
        options: { showContent: true },
        cursor,
        limit: 50,
      });
      for (const o of resp.data) {
        if (!o.data?.content || o.data.content.dataType !== 'moveObject') continue;
        const f = o.data.content.fields as Record<string, unknown>;
        const ticketRoundId = String(f.round_id || '');
        if (roundId && ticketRoundId !== roundId) continue;
        tickets.push({
          id: o.data.objectId,
          ticketId: Number(f.ticket_id || 0),
          roundId: ticketRoundId,
          roundNumber: Number(f.round_number || 0),
          owner: String(f.owner || ''),
          numbers: parseNumbers(f.numbers),
          purchaseTime: Number(f.purchase_time || 0),
        });
      }
      cursor = resp.hasNextPage ? resp.nextCursor : undefined;
    } while (cursor);
    return tickets.sort((a, b) => b.purchaseTime - a.purchaseTime);
  } catch (e) {
    console.error('[lottery] fetchUserTickets:', e);
    return [];
  }
}

export function countMatchingNumbers(ticket: number[], drawn: number[] | null): number {
  if (!drawn) return 0;
  const set = new Set(drawn);
  return ticket.filter((n) => set.has(n)).length;
}

export function getTicketTier(matchCount: number): 0 | 1 | 2 | 3 {
  if (matchCount === 5) return 1;
  if (matchCount === 4) return 2;
  if (matchCount === 3) return 3;
  return 0;
}

// Prize tier constants and helpers used by game-history (added in PR2).
// `parseLotteryRoundFields` is a public alias of the internal `parseRoundFields`
// so the history feature can multi-get rounds without re-implementing parsing.
export const PRIZE_TIER = {
  JACKPOT: 1,
  SECOND: 2,
  THIRD: 3,
  NONE: 0,
} as const;
export type PrizeTier = (typeof PRIZE_TIER)[keyof typeof PRIZE_TIER];

export function getTierPayout(round: LotteryRound, tier: PrizeTier): bigint {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return round.tier1PayoutPerWinner;
    case PRIZE_TIER.SECOND:  return round.tier2PayoutPerWinner;
    case PRIZE_TIER.THIRD:   return round.tier3PayoutPerWinner;
    default: return 0n;
  }
}

export function getTierLabel(tier: PrizeTier): string {
  switch (tier) {
    case PRIZE_TIER.JACKPOT: return 'Jackpot';
    case PRIZE_TIER.SECOND:  return '2nd';
    case PRIZE_TIER.THIRD:   return '3rd';
    default: return '';
  }
}

export function isClaimable(round: LotteryRound, ticket: Ticket, nowMs: number): boolean {
  if (round.status !== ROUND_STATUS.SETTLED) return false;
  if (ticket.roundId !== round.id) return false;
  const matches = countMatchingNumbers(ticket.numbers, round.drawnNumbers);
  if (getTicketTier(matches) === 0) return false;
  // Pure check; on-chain enforces CLAIM_WINDOW_MS via Clock.
  return nowMs < round.drawTime + 30 * 24 * 60 * 60 * 1000;
}

export function formatNusdc(amount: bigint): string {
  const v = Number(amount) / 1_000_000;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ===== Internal (with public alias for game-history) =====

export { parseRoundFields as parseLotteryRoundFields };

function parseRoundFields(id: string, f: Record<string, unknown>): LotteryRound {
  let drawnNumbers: number[] | null = null;
  const drawn = f.drawn_numbers as { vec?: unknown[] } | null;
  if (drawn?.vec && Array.isArray(drawn.vec) && drawn.vec.length > 0) {
    drawnNumbers = parseNumbers(drawn.vec[0]);
  }

  // prize_pool is a Balance<NUSDC>. RPC may serialize either as a Balance
  // with `value` field or as a plain number string depending on SDK version.
  let prizePool = 0n;
  const pp = f.prize_pool;
  if (pp != null) {
    if (typeof pp === 'object' && pp !== null && 'fields' in pp) {
      const v = (pp as { fields?: { value?: string } }).fields?.value;
      if (v != null) prizePool = BigInt(v);
    } else if (typeof pp === 'string' || typeof pp === 'number') {
      prizePool = BigInt(pp.toString());
    }
  }

  return {
    id,
    roundNumber: Number(f.round_number || 0),
    status: (Number(f.status) || 0) as RoundStatus,
    startTime: Number(f.start_time || 0),
    closeTime: Number(f.close_time || 0),
    drawTime: Number(f.draw_time || 0),
    prizePool,
    rolloverIn: BigInt(f.rollover_in?.toString() || '0'),
    drawnNumbers,
    ticketCount: Number(f.ticket_count || 0),
    totalSales: BigInt(f.total_sales?.toString() || '0'),
    tier1Winners: Number(f.tier1_winners || 0),
    tier2Winners: Number(f.tier2_winners || 0),
    tier3Winners: Number(f.tier3_winners || 0),
    tier1PayoutPerWinner: BigInt(f.tier1_payout_per_winner?.toString() || '0'),
    tier2PayoutPerWinner: BigInt(f.tier2_payout_per_winner?.toString() || '0'),
    tier3PayoutPerWinner: BigInt(f.tier3_payout_per_winner?.toString() || '0'),
    tier1RolloverOut: BigInt(f.tier1_rollover_out?.toString() || '0'),
    tier2RolloverOut: BigInt(f.tier2_rollover_out?.toString() || '0'),
    tier3RolloverOut: BigInt(f.tier3_rollover_out?.toString() || '0'),
  };
}

function parseNumbers(value: unknown): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((n) => Number(n));
  return [];
}
