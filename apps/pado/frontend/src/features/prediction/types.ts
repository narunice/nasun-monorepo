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
}

export interface Position {
  id: string;
  marketId: string;
  isYes: boolean;
  shares: bigint;
  costBasis: bigint;
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

// Polymarket display rule: mid when spread ≤ $0.10 (1000 bps),
// otherwise the last traded price.
// https://docs.polymarket.com/concepts/prices-orderbook
const SPREAD_THRESHOLD_BPS = 1000;

export function calculateProbabilityFromOrderbook(
  yesOrderbook: Orderbook | null,
  lastTradePriceBps?: number | null,
): { yesProbability: number; noProbability: number; hasRealOrders: boolean } {
  const realBids = yesOrderbook?.bids.filter((l) => !l.isSimulated) ?? [];
  const realAsks = yesOrderbook?.asks.filter((l) => !l.isSimulated) ?? [];

  const bestBid =
    realBids.length > 0 ? Math.max(...realBids.map((l) => l.price)) : null;
  const bestAsk =
    realAsks.length > 0 ? Math.min(...realAsks.map((l) => l.price)) : null;

  const hasRealOrders = bestBid !== null || bestAsk !== null;
  let yesProbability = 50;

  if (bestBid !== null && bestAsk !== null) {
    const spread = bestAsk - bestBid;
    if (spread <= SPREAD_THRESHOLD_BPS) {
      yesProbability = (bestBid + bestAsk) / 2 / 100;
    } else if (lastTradePriceBps != null) {
      yesProbability = lastTradePriceBps / 100;
    } else {
      yesProbability = (bestBid + bestAsk) / 2 / 100;
    }
  } else if (bestAsk !== null) {
    yesProbability = bestAsk / 100;
  } else if (bestBid !== null) {
    yesProbability = bestBid / 100;
  } else if (lastTradePriceBps != null) {
    yesProbability = lastTradePriceBps / 100;
  }

  yesProbability = Math.max(0.1, Math.min(99.9, yesProbability));
  return { yesProbability, noProbability: 100 - yesProbability, hasRealOrders };
}
