/**
 * Prediction Market Types
 */

export type MarketStatus = 'open' | 'closed' | 'resolved';

export interface PredictionMarket {
  id: string;
  question: string;
  description: string;
  category: string;

  // Timing
  createdAt: number;
  closeTime: number;
  resolveDeadline: number;

  // Supply
  yesSupply: bigint;
  noSupply: bigint;
  collateralBalance: bigint;

  // Statistics
  totalVolume: bigint;

  // Status
  status: MarketStatus;
  outcome?: boolean; // true = YES wins, false = NO wins

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

export interface Order {
  orderId: number;
  owner: string;
  price: number; // Basis points (0-10000)
  amount: bigint;
  timestamp: number;
}

export interface OrderbookLevel {
  price: number;
  amount: bigint;
  orders: Order[];
  isSimulated?: boolean; // true if this level is simulated data
}

export interface Orderbook {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

// Helper to convert status number to string
export function parseMarketStatus(status: number): MarketStatus {
  switch (status) {
    case 0:
      return 'open';
    case 1:
      return 'closed';
    case 2:
      return 'resolved';
    default:
      return 'open';
  }
}

// Calculate probability from supplies (legacy - always returns 50% since tokens mint 1:1)
export function calculateProbability(yesSupply: bigint, noSupply: bigint): number {
  const total = yesSupply + noSupply;
  if (total === 0n) return 50; // Default 50/50
  return Number((noSupply * 10000n) / total) / 100; // YES probability
}

// Calculate probability from orderbook using Polymarket Midpoint method
// Midpoint = (best_bid + best_ask) / 2
// Only uses REAL orders (excludes simulated data)
export function calculateProbabilityFromOrderbook(
  yesOrderbook: Orderbook | null,
  _noOrderbook: Orderbook | null // eslint-disable-line @typescript-eslint/no-unused-vars
): { yesProbability: number; noProbability: number; hasRealOrders: boolean } {
  // Filter to only real orders (exclude simulated)
  const realBids = yesOrderbook?.bids.filter((l) => !l.isSimulated) ?? [];
  const realAsks = yesOrderbook?.asks.filter((l) => !l.isSimulated) ?? [];

  // Find best bid (highest) and best ask (lowest)
  const bestBid =
    realBids.length > 0 ? Math.max(...realBids.map((l) => l.price)) : null;
  const bestAsk =
    realAsks.length > 0 ? Math.min(...realAsks.map((l) => l.price)) : null;

  // Default 50/50 if no real orders
  let yesProbability = 50;
  const hasRealOrders = bestBid !== null || bestAsk !== null;

  if (bestBid !== null && bestAsk !== null) {
    // Both bid and ask exist - calculate midpoint
    const spread = bestAsk - bestBid;
    if (spread <= 1000) {
      // Spread <= 10%: use midpoint
      yesProbability = (bestBid + bestAsk) / 2 / 100;
    } else {
      // Spread > 10%: use best ask (conservative)
      yesProbability = bestAsk / 100;
    }
  } else if (bestAsk !== null) {
    // Only ask exists
    yesProbability = bestAsk / 100;
  } else if (bestBid !== null) {
    // Only bid exists
    yesProbability = bestBid / 100;
  }

  // Clamp to valid range
  yesProbability = Math.max(0.1, Math.min(99.9, yesProbability));
  const noProbability = 100 - yesProbability;

  return { yesProbability, noProbability, hasRealOrders };
}
