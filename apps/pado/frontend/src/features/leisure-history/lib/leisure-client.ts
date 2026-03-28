/**
 * Leisure History Client
 * Fetches game history for lottery, scratchcard, and numbermatch
 * using MoveEventType queries with cursor-based pagination.
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
import type { LeisureActivity, ActivityResult } from '../types';

// -- Generic cursor-paginated event fetcher --

interface FetchResult<T> {
  items: T[];
  isTruncated: boolean;
}

async function fetchUserEventsForType<T>(
  eventType: string,
  userAddress: string,
  addressField: string,
  mapEvent: (event: SuiEvent) => T,
  maxPages = 5,
): Promise<FetchResult<T>> {
  const client = getSuiClient();
  const allItems: T[] = [];
  let cursor: EventId | null = null;
  let exhausted = false;

  for (let page = 0; page < maxPages; page++) {
    const result = await client.queryEvents({
      query: { MoveEventType: eventType },
      limit: 50,
      order: 'descending',
      cursor: cursor ?? undefined,
    });

    for (const event of result.data) {
      const json = event.parsedJson as Record<string, unknown>;
      if (json[addressField] === userAddress) {
        allItems.push(mapEvent(event));
      }
    }

    if (!result.hasNextPage) {
      exhausted = true;
      break;
    }
    cursor = result.nextCursor!;
  }

  return { items: allItems, isTruncated: !exhausted };
}

// -- Scratch Card --

const SCRATCH_EVENT_TYPE = `${SCRATCHCARD_ORIGINAL_PACKAGE_ID}::scratchcard::ScratchCardPurchased`;

function mapScratchEvent(event: SuiEvent): LeisureActivity {
  const data = event.parsedJson as Record<string, string>;
  const multiplier = Number(data.multiplier);
  return {
    id: `scratch-${data.card_id}`,
    gameType: 'scratch',
    gameId: Number(data.card_id),
    timestampMs: Number(event.timestampMs),
    // ScratchCardPurchased event does not include cost; use constant.
    // If CARD_PRICE changes in the future, historical entries will reflect the new price.
    spent: CARD_PRICE,
    payout: BigInt(data.prize_amount),
    result: multiplier > 0 ? 'win' : 'loss',
    detail: multiplier > 0 ? `${multiplier}x` : 'Miss',
  };
}

export function fetchScratchHistory(userAddress: string): Promise<FetchResult<LeisureActivity>> {
  return fetchUserEventsForType(SCRATCH_EVENT_TYPE, userAddress, 'buyer', mapScratchEvent);
}

// -- Number Match --

const NUMBERMATCH_EVENT_TYPE = `${NUMBERMATCH_ORIGINAL_PACKAGE_ID}::numbermatch::NumberMatchPlayed`;

function mapNumberMatchEvent(event: SuiEvent): LeisureActivity {
  const data = event.parsedJson as Record<string, unknown>;
  return {
    id: `numbermatch-${data.game_id}`,
    gameType: 'numbermatch',
    gameId: Number(data.game_id),
    timestampMs: Number(event.timestampMs),
    spent: BigInt(data.cost as string),
    // payout includes consolation refund for losses (1 NUSDC per pick)
    payout: BigInt(data.payout as string),
    result: (data.is_win as boolean) ? 'win' : 'loss',
    detail: `Picks: [${(data.picks as number[]).join(',')}] -> ${data.winning_number}`,
  };
}

export function fetchNumberMatchHistory(userAddress: string): Promise<FetchResult<LeisureActivity>> {
  return fetchUserEventsForType(NUMBERMATCH_EVENT_TYPE, userAddress, 'player', mapNumberMatchEvent);
}

// -- Lottery --

const LOTTERY_EVENT_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::TicketPurchased`;

interface ParsedTicketEvent {
  ticketId: number;
  roundId: string;
  roundNumber: number;
  numbers: number[];
  amount: bigint;
  timestampMs: number;
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
  };
}

/** Batch-fetch lottery round objects, chunked at 50 per RPC call. */
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
): LeisureActivity[] {
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
    };
  });
}

export interface LotteryHistoryResult {
  activities: LeisureActivity[];
  isTruncated: boolean;
}

export async function fetchLotteryHistory(userAddress: string): Promise<LotteryHistoryResult> {
  const { items: tickets, isTruncated } = await fetchUserEventsForType(
    LOTTERY_EVENT_TYPE,
    userAddress,
    'buyer',
    parseTicketEvent,
  );

  const roundIds = [...new Set(tickets.map((t) => t.roundId))];
  const rounds = await fetchRoundsByIds(roundIds);

  return {
    activities: resolveTicketResults(tickets, rounds),
    isTruncated,
  };
}
