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

// Calculate probability from supplies
export function calculateProbability(yesSupply: bigint, noSupply: bigint): number {
  const total = yesSupply + noSupply;
  if (total === 0n) return 50; // Default 50/50
  return Number((noSupply * 10000n) / total) / 100; // YES probability
}
