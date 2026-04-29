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

// Convert numeric on-chain status to typed string. Move emits 0=Open, 1=Resolved, 2=Cancelled.
export function parseMarketStatus(status: number): MarketStatus {
  switch (status) {
    case 0:
      return 'open';
    case 1:
      return 'resolved';
    case 2:
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

// Polymarket midpoint method using only real orders. Excludes simulated.
export function calculateProbabilityFromOrderbook(
  yesOrderbook: Orderbook | null,
  _noOrderbook: Orderbook | null // eslint-disable-line @typescript-eslint/no-unused-vars
): { yesProbability: number; noProbability: number; hasRealOrders: boolean } {
  const realBids = yesOrderbook?.bids.filter((l) => !l.isSimulated) ?? [];
  const realAsks = yesOrderbook?.asks.filter((l) => !l.isSimulated) ?? [];

  const bestBid =
    realBids.length > 0 ? Math.max(...realBids.map((l) => l.price)) : null;
  const bestAsk =
    realAsks.length > 0 ? Math.min(...realAsks.map((l) => l.price)) : null;

  let yesProbability = 50;
  const hasRealOrders = bestBid !== null || bestAsk !== null;

  if (bestBid !== null && bestAsk !== null) {
    const spread = bestAsk - bestBid;
    if (spread <= 1000) {
      yesProbability = (bestBid + bestAsk) / 2 / 100;
    } else {
      yesProbability = bestAsk / 100;
    }
  } else if (bestAsk !== null) {
    yesProbability = bestAsk / 100;
  } else if (bestBid !== null) {
    yesProbability = bestBid / 100;
  }

  yesProbability = Math.max(0.1, Math.min(99.9, yesProbability));
  const noProbability = 100 - yesProbability;

  return { yesProbability, noProbability, hasRealOrders };
}
