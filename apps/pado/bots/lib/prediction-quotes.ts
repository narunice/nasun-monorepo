/**
 * Prediction Market LP Quote Computation
 *
 * Pure functions used by prediction-lp-bot. No I/O, no external state.
 *
 * Two pricing modes:
 *   - Single-level: computeMidpoint + computeQuotes (legacy, kept for tests/back-compat).
 *   - Multi-level ladder: computeLadder, plus midpoint smoothing (applyEma)
 *     and inventory-aware shifting (applyInventorySkew). The bot uses these.
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

export interface LadderLevel {
  /** Order price in bps (1 .. MAX_PRICE_BPS-1). */
  priceBps: number;
  /**
   * Target NUSDC depth at this level (human units).
   * For bids: this is the payment NUSDC.
   * For asks: this is informational; actual depth depends on the Position
   * being consumed (NUSDC_filled = shares * price / MAX_PRICE_BPS).
   */
  sizeNusdc: number;
}

export interface Ladder {
  bids: LadderLevel[];
  asks: LadderLevel[];
}

export interface LadderParams {
  /** Number of levels per side (K). */
  levels: number;
  /** Distance from midpoint to nearest level (half-spread, in bps). */
  baseSpreadBps: number;
  /** Gap between consecutive levels at i=0; grows by gapGrowth per step. */
  levelGapBps: number;
  /** Multiplicative growth applied to gap per step (>=1.0). */
  gapGrowth: number;
  /** NUSDC depth of the level closest to mid. */
  baseSizeNusdc: number;
  /** Multiplicative growth applied to size per step (>=1.0). */
  sizeGrowth: number;
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

/**
 * Exponentially-weighted moving average over midpoint observations.
 *
 * `lambda` is the weight on the new observation: 1.0 = no smoothing,
 * 0.0 = freeze. Returns the new observation as-is when prev is null.
 */
export function applyEma(
  prevEma: number | null,
  newMid: number,
  lambda: number,
): number {
  if (prevEma === null || !Number.isFinite(prevEma)) return newMid;
  const l = Math.max(0, Math.min(1, lambda));
  return Math.round(l * newMid + (1 - l) * prevEma);
}

/**
 * Shift midpoint based on the LP's outcome inventory.
 *
 * deltaInv = yesShares - noShares. Positive (yes-heavy) means we want to
 * sell more YES / buy less YES, so we push the midpoint DOWN (lower asks
 * become more attractive to takers). Negative does the opposite.
 *
 * The shift is alphaBps * (deltaInv / invCap), clamped at ±alphaBps.
 * Result is clamped to [1, MAX_PRICE_BPS - 1].
 */
export function applyInventorySkew(
  midpoint: number,
  deltaInvShares: bigint,
  invCapShares: bigint,
  alphaBps: number,
): number {
  if (alphaBps <= 0 || invCapShares <= 0n) return midpoint;
  const cap = Number(invCapShares);
  if (!Number.isFinite(cap) || cap <= 0) return midpoint;
  const ratioRaw = Number(deltaInvShares) / cap;
  const ratio = Math.max(-1, Math.min(1, ratioRaw));
  const shift = Math.round(-alphaBps * ratio);
  const next = midpoint + shift;
  return Math.max(1, Math.min(MAX_PRICE_BPS - 1, next));
}

/**
 * Build a K-level price ladder around the midpoint.
 *
 * Level i (i=0 nearest the mid):
 *   bid_i price = mid - baseSpreadBps - sumGap(i)
 *   ask_i price = mid + baseSpreadBps + sumGap(i)
 *   size_i      = baseSizeNusdc * sizeGrowth^i
 * where sumGap(i) = levelGapBps * (1 + gapGrowth + gapGrowth^2 + ... + gapGrowth^(i-1))
 * (sumGap(0) = 0).
 *
 * Prices are clamped to [1, MAX_PRICE_BPS - 1]. After clamping, levels with
 * duplicate prices on the same side are dropped (keeping the inner-most).
 */
export function computeLadder(midpoint: number, params: LadderParams): Ladder {
  const {
    levels,
    baseSpreadBps,
    levelGapBps,
    gapGrowth,
    baseSizeNusdc,
    sizeGrowth,
  } = params;
  if (levels <= 0) return { bids: [], asks: [] };

  const bids: LadderLevel[] = [];
  const asks: LadderLevel[] = [];

  let cumGap = 0;
  let gap = levelGapBps;
  for (let i = 0; i < levels; i++) {
    const offset = baseSpreadBps + cumGap;
    const sizeMul = Math.pow(sizeGrowth, i);
    const sizeNusdc = baseSizeNusdc * sizeMul;
    const bidPrice = Math.max(1, Math.round(midpoint - offset));
    const askPrice = Math.min(MAX_PRICE_BPS - 1, Math.round(midpoint + offset));
    bids.push({ priceBps: bidPrice, sizeNusdc });
    asks.push({ priceBps: askPrice, sizeNusdc });
    cumGap += gap;
    gap = gap * gapGrowth;
  }

  return {
    bids: dedupeLevels(bids),
    asks: dedupeLevels(asks),
  };
}

function dedupeLevels(levels: LadderLevel[]): LadderLevel[] {
  const seen = new Set<number>();
  const out: LadderLevel[] = [];
  for (const lv of levels) {
    if (seen.has(lv.priceBps)) continue;
    seen.add(lv.priceBps);
    out.push(lv);
  }
  return out;
}

/**
 * Mirror a YES ladder onto the NO order book.
 *
 * Identity used by the contract: YES + NO = MAX_PRICE. So a YES bid at price
 * p is economically equivalent to a NO ask at MAX_PRICE - p, and vice-versa.
 * Sizes carry over unchanged (NUSDC depth on bids, share-equivalent on asks).
 */
export function complementLadder(yesLadder: Ladder): Ladder {
  const flipPrice = (p: number): number =>
    Math.max(1, Math.min(MAX_PRICE_BPS - 1, MAX_PRICE_BPS - p));
  // NO bid mirrors YES ask; NO ask mirrors YES bid.
  const noBids: LadderLevel[] = yesLadder.asks.map((lv) => ({
    priceBps: flipPrice(lv.priceBps),
    sizeNusdc: lv.sizeNusdc,
  }));
  const noAsks: LadderLevel[] = yesLadder.bids.map((lv) => ({
    priceBps: flipPrice(lv.priceBps),
    sizeNusdc: lv.sizeNusdc,
  }));
  return {
    bids: dedupeLevels(noBids),
    asks: dedupeLevels(noAsks),
  };
}
