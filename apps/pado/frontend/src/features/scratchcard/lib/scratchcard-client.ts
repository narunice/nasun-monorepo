/**
 * Scratchcard RPC Client
 * Fetches pool state and user's winning cards from chain
 */
import { getSuiClient } from '../../../lib/sui-client';
import {
  SCRATCHCARD_POOL_ID,
  SCRATCHCARD_TYPE,
  SCRATCHCARD_PACKAGE_ID,
} from '../constants';
import type { ScratchCardPool, ScratchCard, ScratchResult } from '../types';

/** Fetch the shared ScratchCardPool object */
export async function fetchScratchCardPool(): Promise<ScratchCardPool> {
  const client = getSuiClient();
  const response = await client.getObject({
    id: SCRATCHCARD_POOL_ID,
    options: { showContent: true },
  });

  if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
    throw new Error('Failed to fetch ScratchCardPool');
  }

  const fields = response.data.content.fields as Record<string, unknown>;

  return {
    id: SCRATCHCARD_POOL_ID,
    poolBalance: BigInt(fields.pool as string),
    isPaused: fields.is_paused as boolean,
    currentDay: Number(fields.current_day),
    dailyCardCount: Number(fields.daily_card_count),
    totalCardsSold: Number(fields.total_cards_sold),
    totalPrizesPaid: BigInt(fields.total_prizes_paid as string),
    nextCardId: Number(fields.next_card_id),
  };
}

/** Fetch user's winning ScratchCard NFTs */
export async function fetchUserScratchCards(
  userAddress: string,
): Promise<ScratchCard[]> {
  const client = getSuiClient();

  const response = await client.getOwnedObjects({
    owner: userAddress,
    filter: { StructType: SCRATCHCARD_TYPE },
    options: { showContent: true },
  });

  return response.data
    .filter((obj) => obj.data?.content?.dataType === 'moveObject')
    .map((obj) => {
      const fields = (obj.data!.content as { fields: Record<string, unknown> }).fields;
      return {
        id: obj.data!.objectId,
        cardId: Number(fields.card_id),
        purchaseTime: Number(fields.purchase_time),
        multiplier: Number(fields.multiplier),
        prizeAmount: BigInt(fields.prize_amount as string),
      };
    })
    .sort((a, b) => b.cardId - a.cardId); // Newest first
}

/** Parse ScratchCardPurchased event from transaction result */
export function parseScratchCardEvent(
  events: Array<{ type: string; parsedJson: unknown }>,
): ScratchResult | null {
  const eventType = `${SCRATCHCARD_PACKAGE_ID}::scratchcard::ScratchCardPurchased`;
  const event = events.find((e) => e.type === eventType);
  if (!event) return null;

  const data = event.parsedJson as Record<string, string>;
  const multiplier = Number(data.multiplier);

  return {
    cardId: Number(data.card_id),
    buyer: data.buyer,
    multiplier,
    prizeAmount: BigInt(data.prize_amount),
    isWinner: multiplier > 0,
  };
}

/** Format NUSDC amount (6 decimals) for display */
export function formatNusdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
