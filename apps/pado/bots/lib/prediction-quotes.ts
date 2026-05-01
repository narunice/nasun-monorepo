/**
 * Prediction Market LP Quote Computation
 *
 * Pure functions used by prediction-lp-bot to derive single-level YES quotes
 * from the current order book. No I/O, no external state.
 */

export const MAX_PRICE_BPS = 10_000;

export interface BookOrder {
  orderId: number;
  owner: string;
  isBid: boolean;
  price: number;
  amount: bigint;
}

export interface DesiredQuotes {
  bidBps: number;
  askBps: number;
}

/**
 * Compute the LP's reference midpoint in basis points.
 *
 * Excludes the LP's own orders so the bot doesn't anchor against itself.
 * Falls back to nudge-from-one-side or 5000 (50%) when the external book is
 * one-sided or empty.
 */
export function computeMidpoint(
  bids: BookOrder[],
  asks: BookOrder[],
  myAddress: string,
): number {
  const externalBids = bids.filter((o) => o.owner !== myAddress);
  const externalAsks = asks.filter((o) => o.owner !== myAddress);
  const bestBid = externalBids.reduce<number>((m, o) => (o.price > m ? o.price : m), 0);
  const bestAsk = externalAsks.reduce<number>(
    (m, o) => (o.price < m ? o.price : m),
    MAX_PRICE_BPS,
  );
  if (bestBid > 0 && bestAsk < MAX_PRICE_BPS) return Math.round((bestBid + bestAsk) / 2);
  if (bestBid > 0) return Math.min(MAX_PRICE_BPS - 1, bestBid + 50);
  if (bestAsk < MAX_PRICE_BPS) return Math.max(1, bestAsk - 50);
  return 5000;
}

/**
 * Derive bid/ask from midpoint and total spread, clamped to the legal range
 * (1 .. MAX_PRICE_BPS-1). Half-spread rounds down, so total spread can be
 * spreadBps - 1 when spreadBps is odd. Acceptable for mvp.
 */
export function computeQuotes(midpoint: number, spreadBps: number): DesiredQuotes {
  const half = Math.max(1, Math.floor(spreadBps / 2));
  return {
    bidBps: Math.max(1, midpoint - half),
    askBps: Math.min(MAX_PRICE_BPS - 1, midpoint + half),
  };
}
