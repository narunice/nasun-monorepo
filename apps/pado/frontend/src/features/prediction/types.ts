/**
 * Prediction Market Types (v1 ABI — round-6 plan §2.1)
 */

export type MarketStatus = 'open' | 'resolved' | 'cancelled';

export interface PredictionMarket {
  id: string;
  question: string;
  description: string;
  category: string;
  resolutionSource: string;
  resolutionCriteria: string;

  // Timing
  createdAt: number;
  closeTime: number;
  resolveDeadline: number;

  // Supply
  yesSupply: bigint;
  noSupply: bigint;
  collateralBalance: bigint;

  // Statistics (suppressed in v1 UI per plan §2.18)
  totalVolume: bigint;

  // Status
  status: MarketStatus;
  outcome?: boolean;

  // Admin
  creator: string;
  resolver: string;

  // Best price levels (heads of the on-chain sorted price vectors). Read
  // inline from the Market object — no extra RPC call. List cards use these
  // to display accurate probability without walking the dynamic-field
  // orderbook tables.
  bestPrices: BestPrices;
}

export interface BestPrices {
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
}

export interface Position {
  id: string;
  marketId: string;
  isYes: boolean;
  shares: bigint;
  costBasis: bigint;
  // Optimistic-update flag. Set when the row is synthesized from a tx receipt
  // before the on-chain indexer has caught up. Replaced by indexer-sourced
  // data (same id, no flag) on first successful refetch.
  _pending?: boolean;
}

/**
 * Order — v1 CLOB shape. Each level has FIFO orders that include direction
 * (isYes/isBid) and locked NUSDC for buy orders (basis for refund/cost
 * accounting on partial fills + cancellation).
 */
export interface Order {
  orderId: number;
  owner: string;
  isYes: boolean;
  isBid: boolean;
  price: number; // Basis points (1-9999)
  amount: bigint;
  lockedNusdc: bigint;
  costBasis: bigint;
  timestamp: number;
}

export interface OrderbookLevel {
  price: number;
  amount: bigint;
  orders: Order[];
  isSimulated?: boolean;
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface RecentFill {
  marketId: string;
  orderId: number;
  taker: string;
  maker: string;
  isYes: boolean;
  isBid: boolean;
  price: number;
  fillShares: bigint;
  cost: bigint;
  timestamp: number;
  // Optimistic-update flag. Same semantics as Position._pending: synthesized
  // from tx receipt, evicted once the global event poll surfaces the same
  // OrderFilled.
  _pending?: boolean;
}

/**
 * TradeHistoryRow: user-facing fill row.
 *
 * isBuy is normalized to the user's perspective:
 *   - taker side: !is_bid means user BOUGHT (took an ask)
 *   - maker side: is_bid means user BOUGHT (rested bid filled)
 */
export interface TradeHistoryRow {
  marketId: string;
  orderId: number;
  isYes: boolean;
  isTaker: boolean;
  isBuy: boolean;
  priceBps: number;
  fillShares: bigint;
  cost: bigint;
  timestamp: number;
  txDigest?: string;
}

// Convert numeric on-chain status to typed string. Move emits 0=Open, 2=Resolved, 3=Cancelled.
// STATUS_CLOSED=1 was removed in round-6; close is enforced via clock, not a status transition.
export function parseMarketStatus(status: number): MarketStatus {
  switch (status) {
    case 0:
      return 'open';
    case 2:
      return 'resolved';
    case 3:
      return 'cancelled';
    default:
      return 'open';
  }
}

// Calculate probability from supplies (legacy — always returns 50% since tokens mint 1:1)
export function calculateProbability(yesSupply: bigint, noSupply: bigint): number {
  const total = yesSupply + noSupply;
  if (total === 0n) return 50;
  return Number((noSupply * 10000n) / total) / 100;
}

// Polymarket display rule + Kalshi reciprocal derivation.
// - Effective YES bid/ask combine the YES book with NO book reciprocals
//   (NO bid X bps ⇒ implied YES ask 10000-X; NO ask X ⇒ implied YES bid 10000-X).
// - Mid when effective spread ≤ 1000 bps, otherwise last traded price.
// https://docs.polymarket.com/concepts/prices-orderbook
// https://docs.kalshi.com/getting_started/orderbook_responses
const SPREAD_THRESHOLD_BPS = 1000;
const MAX_PRICE_BPS = 10000;

function bestBid(ob: Orderbook | null): number | null {
  const real = ob?.bids.filter((l) => !l.isSimulated) ?? [];
  return real.length > 0 ? Math.max(...real.map((l) => l.price)) : null;
}

function bestAsk(ob: Orderbook | null): number | null {
  const real = ob?.asks.filter((l) => !l.isSimulated) ?? [];
  return real.length > 0 ? Math.min(...real.map((l) => l.price)) : null;
}

export interface ProbabilityResult {
  yesProbability: number;
  noProbability: number;
  /**
   * True when the displayed probability reflects on-chain quotes or a recent
   * fill (i.e. it is not a 50% fallback). Callers gate "real number" UI vs a
   * neutral "—" placeholder on this flag.
   */
  hasRealQuotes: boolean;
}

/**
 * Core probability rule. Operates on the four best-price scalars (YES/NO ×
 * bid/ask) plus an optional last trade price. Used directly by views that
 * read the inline `bestPrices` stored on the Market object, and indirectly
 * by `calculateProbabilityFromOrderbook` (which extracts the quartet from a
 * full orderbook before delegating).
 */
export function calculateProbabilityFromBestPrices(
  bp: BestPrices,
  lastTradePriceBps?: number | null,
): ProbabilityResult {
  const impliedYesAsk = bp.noBid !== null ? MAX_PRICE_BPS - bp.noBid : null;
  const impliedYesBid = bp.noAsk !== null ? MAX_PRICE_BPS - bp.noAsk : null;

  const effectiveBid = [bp.yesBid, impliedYesBid]
    .filter((v): v is number => v !== null)
    .reduce<number | null>((acc, v) => (acc === null || v > acc ? v : acc), null);
  const effectiveAsk = [bp.yesAsk, impliedYesAsk]
    .filter((v): v is number => v !== null)
    .reduce<number | null>((acc, v) => (acc === null || v < acc ? v : acc), null);

  const hasRealQuotes =
    effectiveBid !== null || effectiveAsk !== null || lastTradePriceBps != null;

  let yesProbability = 50;
  if (effectiveBid !== null && effectiveAsk !== null) {
    const spread = effectiveAsk - effectiveBid;
    if (spread <= SPREAD_THRESHOLD_BPS) {
      yesProbability = (effectiveBid + effectiveAsk) / 2 / 100;
    } else if (lastTradePriceBps != null) {
      yesProbability = lastTradePriceBps / 100;
    } else {
      yesProbability = (effectiveBid + effectiveAsk) / 2 / 100;
    }
  } else if (effectiveAsk !== null) {
    yesProbability = effectiveAsk / 100;
  } else if (effectiveBid !== null) {
    yesProbability = effectiveBid / 100;
  } else if (lastTradePriceBps != null) {
    yesProbability = lastTradePriceBps / 100;
  }

  yesProbability = Math.max(0.1, Math.min(99.9, yesProbability));
  return { yesProbability, noProbability: 100 - yesProbability, hasRealQuotes };
}

/**
 * Adapter for callers that have full orderbooks (detail page). Extracts
 * best bid/ask from each side and delegates to `calculateProbabilityFromBestPrices`
 * so the pricing rule lives in exactly one place.
 */
export function calculateProbabilityFromOrderbook(
  yesOrderbook: Orderbook | null,
  noOrderbook?: Orderbook | null,
  lastTradePriceBps?: number | null,
): ProbabilityResult {
  return calculateProbabilityFromBestPrices(
    {
      yesBid: bestBid(yesOrderbook),
      yesAsk: bestAsk(yesOrderbook),
      noBid: bestBid(noOrderbook ?? null),
      noAsk: bestAsk(noOrderbook ?? null),
    },
    lastTradePriceBps,
  );
}
