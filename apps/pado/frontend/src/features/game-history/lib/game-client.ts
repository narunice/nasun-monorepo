/**
 * Game History Client
 * Fetches game history using Sender-based event query.
 * Queries the user's own events and filters by game event types client-side.
 */
import type { SuiEvent, EventId } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import {
  LOTTERY_ORIGINAL_PACKAGE_ID,
  SCRATCHCARD_ORIGINAL_PACKAGE_ID,
  NUMBERMATCH_ORIGINAL_PACKAGE_ID,
} from '@nasun/devnet-config';
import { CARD_PRICE } from '../../scratchcard/constants';
import { parseLotteryRoundFields } from '../../lottery/lib/lottery-client';
import { getTicketTier, getTierPayout, getTierLabel } from '../../lottery/types';
import { PRIZE_TIER } from '../../lottery/constants';
import type { LotteryRound } from '../../lottery/types';
import type { GameActivity, ActivityResult } from '../types';

// -- Event type constants --

const SCRATCH_EVENT_TYPE = `${SCRATCHCARD_ORIGINAL_PACKAGE_ID}::scratchcard::ScratchCardPurchased`;
const NUMBERMATCH_EVENT_TYPE = `${NUMBERMATCH_ORIGINAL_PACKAGE_ID}::numbermatch::NumberMatchPlayed`;
const LOTTERY_EVENT_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::TicketPurchased`;

const GAME_EVENT_TYPES = new Set([SCRATCH_EVENT_TYPE, NUMBERMATCH_EVENT_TYPE, LOTTERY_EVENT_TYPE]);

// -- Sender-based event fetcher --

interface RawGameEvents {
  scratch: SuiEvent[];
  numbermatch: SuiEvent[];
  lottery: SuiEvent[];
  isTruncated: boolean;
}

/**
 * Fetch all game-related events for a user using Sender filter.
 * This queries only the user's transactions, avoiding the scaling issue
 * where MoveEventType queries miss user events due to high global volume.
 */
async function fetchUserGameEvents(
  userAddress: string,
  maxPages = 20,
): Promise<RawGameEvents> {
  const client = getSuiClient();
  const scratch: SuiEvent[] = [];
  const numbermatch: SuiEvent[] = [];
  const lottery: SuiEvent[] = [];
  let cursor: EventId | null = null;
  let exhausted = false;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.queryEvents({
      query: { Sender: userAddress },
      limit: 50,
      order: 'descending',
      cursor: cursor ?? undefined,
    });

    for (const event of result.data) {
      if (!GAME_EVENT_TYPES.has(event.type)) continue;

      if (event.type === SCRATCH_EVENT_TYPE) {
        scratch.push(event);
      } else if (event.type === NUMBERMATCH_EVENT_TYPE) {
        numbermatch.push(event);
      } else if (event.type === LOTTERY_EVENT_TYPE) {
        lottery.push(event);
      }
    }

    if (!result.hasNextPage) {
      exhausted = true;
      break;
    }
    cursor = result.nextCursor!;
  }

  return { scratch, numbermatch, lottery, isTruncated: !exhausted };
}

// -- Scratch Card mapper --

function mapScratchEvent(event: SuiEvent): GameActivity {
  const data = event.parsedJson as Record<string, string>;
  const multiplier = Number(data.multiplier);
  return {
    id: `scratch-${data.card_id}`,
    gameType: 'scratch',
    gameId: Number(data.card_id),
    timestampMs: Number(event.timestampMs),
    // ScratchCardPurchased event does not include cost; use constant.
    spent: CARD_PRICE,
    payout: BigInt(data.prize_amount),
    result: multiplier > 0 ? 'win' : 'loss',
    detail: multiplier > 0 ? `${multiplier}x` : 'Miss',
    txDigest: event.id.txDigest,
  };
}

// -- Number Match mapper --

function mapNumberMatchEvent(event: SuiEvent): GameActivity {
  const data = event.parsedJson as Record<string, unknown>;
  return {
    id: `numbermatch-${data.game_id}`,
    gameType: 'numbermatch',
    gameId: Number(data.game_id),
    timestampMs: Number(event.timestampMs),
    spent: BigInt(data.cost as string),
    payout: BigInt(data.payout as string),
    result: (data.is_win as boolean) ? 'win' : 'loss',
    detail: `Picks: [${(data.picks as number[]).join(',')}] -> ${data.winning_number}`,
    txDigest: event.id.txDigest,
  };
}

// -- Lottery helpers --

interface ParsedTicketEvent {
  ticketId: number;
  roundId: string;
  roundNumber: number;
  numbers: number[];
  amount: bigint;
  timestampMs: number;
  txDigest: string;
}

function parseTicketEvent(event: SuiEvent): ParsedTicketEvent {
  const data = event.parsedJson as Record<string, unknown>;
  return {
    ticketId: Number(data.ticket_id),
    roundId: data.round_id as string,
    roundNumber: Number(data.round_number),
    numbers: (data.numbers as number[]).map(Number),
    amount: BigInt(data.amount as string),
    timestampMs: Number(event.timestampMs),
    txDigest: event.id.txDigest,
  };
}

async function fetchRoundsByIds(roundIds: string[]): Promise<Map<string, LotteryRound>> {
  const cache = new Map<string, LotteryRound>();
  if (roundIds.length === 0) return cache;

  const client = getSuiClient();

  for (let i = 0; i < roundIds.length; i += 50) {
    const chunk = roundIds.slice(i, i + 50);
    const results = await client.multiGetObjects({
      ids: chunk,
      options: { showContent: true },
    });

    for (const obj of results) {
      if (obj.data?.content?.dataType === 'moveObject') {
        try {
          const round = parseLotteryRoundFields(
            obj.data.objectId,
            obj.data.content.fields as Record<string, unknown>,
          );
          cache.set(round.id, round);
        } catch {
          // Skip rounds that fail to parse; tickets will show as pending
        }
      }
    }
  }

  return cache;
}

function resolveTicketResults(
  tickets: ParsedTicketEvent[],
  rounds: Map<string, LotteryRound>,
): GameActivity[] {
  return tickets.map((ticket) => {
    const round = rounds.get(ticket.roundId);
    let result: ActivityResult = 'pending';
    let payout = 0n;
    let tierLabel = '';

    if (round?.drawnNumbers) {
      const tier = getTicketTier(round.drawnNumbers, ticket.numbers);
      if (tier !== PRIZE_TIER.NONE) {
        result = 'win';
        payout = getTierPayout(round, tier);
        tierLabel = ` (${getTierLabel(tier)})`;
      } else {
        result = 'loss';
      }
    }

    return {
      id: `lottery-${ticket.ticketId}`,
      gameType: 'lottery' as const,
      gameId: ticket.ticketId,
      timestampMs: ticket.timestampMs,
      spent: ticket.amount,
      payout,
      result,
      detail: `R${ticket.roundNumber} #${ticket.ticketId}${tierLabel}`,
      txDigest: ticket.txDigest,
    };
  });
}

// -- Public API --

export interface FetchResult<T> {
  items: T[];
  isTruncated: boolean;
}

export interface LotteryHistoryResult {
  activities: GameActivity[];
  isTruncated: boolean;
}

export interface AllGameHistoryResult {
  scratch: FetchResult<GameActivity>;
  numbermatch: FetchResult<GameActivity>;
  lottery: LotteryHistoryResult;
}

/**
 * Fetch all game history for a user in a single pass using Sender filter.
 * Returns categorized results for each game type.
 */
export async function fetchAllGameHistory(userAddress: string): Promise<AllGameHistoryResult> {
  const raw = await fetchUserGameEvents(userAddress);

  const scratchItems = raw.scratch.map(mapScratchEvent);
  const numbermatchItems = raw.numbermatch.map(mapNumberMatchEvent);

  // Lottery needs round data to resolve win/loss
  const tickets = raw.lottery.map(parseTicketEvent);
  const roundIds = [...new Set(tickets.map((t) => t.roundId))];
  const rounds = await fetchRoundsByIds(roundIds);
  const lotteryActivities = resolveTicketResults(tickets, rounds);

  return {
    scratch: { items: scratchItems, isTruncated: raw.isTruncated },
    numbermatch: { items: numbermatchItems, isTruncated: raw.isTruncated },
    lottery: { activities: lotteryActivities, isTruncated: raw.isTruncated },
  };
}

// Keep individual fetchers for backward compatibility (used by cache invalidation)
export async function fetchScratchHistory(userAddress: string): Promise<FetchResult<GameActivity>> {
  const result = await fetchAllGameHistory(userAddress);
  return result.scratch;
}

export async function fetchNumberMatchHistory(userAddress: string): Promise<FetchResult<GameActivity>> {
  const result = await fetchAllGameHistory(userAddress);
  return result.numbermatch;
}

export async function fetchLotteryHistory(userAddress: string): Promise<LotteryHistoryResult> {
  const result = await fetchAllGameHistory(userAddress);
  return result.lottery;
}
