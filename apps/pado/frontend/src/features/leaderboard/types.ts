export type Period = '24h' | '7d' | '30d' | 'all';
export type LeaderboardMode = 'activity' | 'volume' | 'pnl' | 'score';
export type ScoreScope = 'weekly' | 'alltime';

export interface LeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass?: boolean;
  volumeUsd: string;
  tradeCount: number;
  uniquePools: number;
  rankChange: number;
  lastTradeAt: number;
  followerCount?: number;
}

export interface LeaderboardResponse {
  period: Period;
  traders: LeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface PnlLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass?: boolean;
  pnlUsd: string;
  pnlPercent: number;
  tradeCount: number;
  rankChange: number;
  followerCount?: number;
}

export interface PnlLeaderboardResponse {
  mode: 'pnl';
  period: Period;
  traders: PnlLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface ScoreLeaderboardTrader {
  rank: number;
  address: string;
  nickname: string | null;
  hasGenesisPass?: boolean;
  totalScore: number;
  tradeCount: number;
  volumeUsd: string;
  rankChange: number;
  followerCount?: number;
}

export interface ScoreLeaderboardResponse {
  scope: ScoreScope;
  weekStartDate?: string;
  traders: ScoreLeaderboardTrader[];
  updatedAt: number;
  totalTraders: number;
}

export interface TraderScoreResponse {
  address: string;
  nickname: string | null;
  totalScore: number;
  breakdown: {
    trades: number;
    volume: number;
    diversity: number;
    pnl: number;
  };
  rank: number;
  scope: ScoreScope;
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
  hasGenesisPass?: boolean;
  lastTradeAt?: number | null;
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
