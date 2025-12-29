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

// Calculate probability from orderbook (best ask = market price)
// YES probability = YES best ask, NO probability = 100 - YES
export function calculateProbabilityFromOrderbook(
  yesOrderbook: Orderbook | null,
  _noOrderbook: Orderbook | null
): { yesProbability: number; noProbability: number } {
  // Default 50/50
  let yesProbability = 50;

  // YES probability = YES best ask price (lowest price to buy YES)
  // If someone is selling YES at 35%, that means YES probability ~35%
  if (yesOrderbook?.asks && yesOrderbook.asks.length > 0) {
    // Find lowest ask price (sort ascending)
    const sortedAsks = [...yesOrderbook.asks].sort((a, b) => a.price - b.price);
    yesProbability = sortedAsks[0].price / 100; // Convert basis points to %
  }

  // NO probability is always complement of YES
  const noProbability = 100 - yesProbability;

  return { yesProbability, noProbability };
}
