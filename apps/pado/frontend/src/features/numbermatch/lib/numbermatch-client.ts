/**
 * Number Match RPC Client
 * Fetches pool state and play history from chain.
 * No winner NFTs -- history is events-only.
 */
import { getSuiClient } from '../../../lib/sui-client';
import { NUMBERMATCH_POOL_ID, NUMBERMATCH_ORIGINAL_PACKAGE_ID } from '../constants';
import type { NumberMatchPool, NumberMatchResult } from '../types';

/** Fetch the shared NumberMatchPool object */
export async function fetchNumberMatchPool(): Promise<NumberMatchPool> {
  const client = getSuiClient();
  const response = await client.getObject({
    id: NUMBERMATCH_POOL_ID,
    options: { showContent: true },
  });

  if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
    throw new Error('Failed to fetch NumberMatchPool');
  }

  const fields = response.data.content.fields as Record<string, unknown>;

  return {
    id: NUMBERMATCH_POOL_ID,
    poolBalance: BigInt(fields.pool as string),
    isPaused: fields.is_paused as boolean,
    currentDay: Number(fields.current_day),
    dailyPlayCount: Number(fields.daily_play_count),
    totalPlays: Number(fields.total_plays),
    totalPrizesPaid: BigInt(fields.total_prizes_paid as string),
    nextGameId: Number(fields.next_game_id),
  };
}

/** Fetch play history from events (both wins and losses).
 *  Uses packageId for event type query. */
export async function fetchPlayHistory(
  userAddress: string,
  limit = 50,
): Promise<NumberMatchResult[]> {
  const client = getSuiClient();
  const eventType = `${NUMBERMATCH_ORIGINAL_PACKAGE_ID}::numbermatch::NumberMatchPlayed`;

  const response = await client.queryEvents({
    query: { MoveEventType: eventType },
    limit,
    order: 'descending',
  });

  return response.data
    .map((event) => {
      const data = event.parsedJson as Record<string, unknown>;
      return {
        gameId: Number(data.game_id),
        player: data.player as string,
        picks: (data.picks as number[]).map(Number),
        winningNumber: Number(data.winning_number),
        isWin: data.is_win as boolean,
        cost: BigInt(data.cost as string),
        payout: BigInt(data.payout as string),
        timestampMs: Number(event.timestampMs ?? 0),
      };
    })
    .filter((r) => r.player === userAddress);
}

/** Parse NumberMatchPlayed event from transaction result.
 *  Matches by suffix to handle potential package upgrades. */
export function parseNumberMatchEvent(
  events: Array<{ type: string; parsedJson: unknown }>,
): NumberMatchResult | null {
  const event = events.find((e) => e.type.endsWith('::numbermatch::NumberMatchPlayed'));
  if (!event) return null;

  const data = event.parsedJson as Record<string, unknown>;

  return {
    gameId: Number(data.game_id),
    player: data.player as string,
    picks: (data.picks as number[]).map(Number),
    winningNumber: Number(data.winning_number),
    isWin: data.is_win as boolean,
    cost: BigInt(data.cost as string),
    payout: BigInt(data.payout as string),
  };
}
