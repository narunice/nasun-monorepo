export type Period = '24h' | '7d' | '30d' | 'all';

export interface LeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  volumeUsd: string;
  tradeCount: number;
  uniquePools: number;
  rankChange: number;
  lastTradeAt: number;
}

export interface LeaderboardResponse {
  period: Period;
  traders: LeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface TraderPeriodStats {
  rank: number;
  volume: string;
  tradeCount: number;
  uniquePools: number;
  rankChange: number;
}

export interface TraderStatsResponse {
  address: string;
  nickname: string | null;
  stats: Record<Period, TraderPeriodStats | null>;
}

export interface LeaderboardStatusResponse {
  indexerRunning: boolean;
  lastIndexedAt: number;
  totalFillsIndexed: number;
  totalTradersTracked: number;
}

export const PERIOD_LABELS: Record<Period, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  'all': 'All',
};

// ===== Trader Profile Types =====

export interface TraderFill {
  txDigest: string;
  poolId: string;
  side: 'buy' | 'sell';
  price: string;
  baseQuantity: string;
  quoteQuantity: string;
  timestamp: number;
}

export interface TraderFillsResponse {
  address: string;
  fills: TraderFill[];
  hasMore: boolean;
}
