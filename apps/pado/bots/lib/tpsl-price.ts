/**
 * TP/SL Trigger Price Selection
 *
 * Pure functions, kept out of tpsl-keeper.ts so they can be unit tested without
 * booting the keeper's HTTP server.
 *
 * Two price sources feed the keeper:
 *
 *   - Oracle symbols (NBTC/NETH/NSOL): price-updater pushes external quotes
 *     on-chain. Nothing a trader does to the DeepBook book moves them.
 *
 *   - Book symbols (NSN): the price IS the local order book, because the DEX is
 *     the only venue. Here the choice of price matters for more than accuracy:
 *     the mid can be moved by *posting* an order, so pricing triggers off the
 *     mid lets anyone drag other users' stop-losses into firing for the cost of
 *     a single small quote. Each side's own top of book cannot be moved that
 *     way — lowering the best bid requires consuming the bids that are there,
 *     which is a real purchase. So a trigger is evaluated against the side it
 *     would actually execute into: a sell against the best bid, a buy against
 *     the best ask. That also makes the trigger price the price the user gets.
 */

import type { OrderSide } from './tpsl-store.js';

export interface PriceQuote {
  /** Reference price: oracle value, or book mid. Used for display and sanity checks. */
  price: number;
  /** Present only for book-sourced symbols. 0 means that side is empty. */
  bestBid?: number;
  bestAsk?: number;
}

/**
 * Price a trigger should be evaluated against, or null when the quote cannot
 * support this side (empty book side, or no price at all). Null must leave the
 * order untriggered rather than falling back to a looser price.
 */
export function selectTriggerPrice(quote: PriceQuote | undefined, side: OrderSide): number | null {
  if (!quote) return null;

  const isBookSourced = quote.bestBid !== undefined || quote.bestAsk !== undefined;
  if (isBookSourced) {
    const executable = side === 'sell' ? quote.bestBid : quote.bestAsk;
    return executable !== undefined && executable > 0 ? executable : null;
  }

  return quote.price > 0 ? quote.price : null;
}

/** Book mid, or 0 when either side is empty. Display and registration sanity checks only. */
export function midPrice(bestBid: number, bestAsk: number): number {
  return bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
}
