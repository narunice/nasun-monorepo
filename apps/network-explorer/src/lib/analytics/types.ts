export type TimeRange = '7d' | '30d' | 'all';

export interface DayBoundary {
  date: string; // YYYY-MM-DD
  checkpointSeq: string;
  networkTotalTx: number;
  timestampMs: number;
}

export interface TxHistoryData {
  date: string; // YYYY-MM-DD
  dailyTx: number;
  cumulativeTx: number;
}

export interface TradingActivityData {
  date: string; // YYYY-MM-DD
  tradeCount: number;
  volumeUsd: number;
}

export interface AnalyticsSummary {
  totalTx: number;
  last24hTx: number;
  avgTps: number;
  last24hTrades: number;
  trends: {
    tx24h: number; // percentage change
  };
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  txHistory: TxHistoryData[];
}
