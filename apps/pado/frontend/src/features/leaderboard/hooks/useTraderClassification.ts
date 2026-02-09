import { useMemo } from 'react';
import type { TraderFill, TraderStatsResponse } from '../types';

export type TradingStyle = 'scalper' | 'day-trader' | 'swing-trader' | 'holder';

export interface TraderClassification {
  style: TradingStyle;
  label: string;
  description: string;
}

const CLASSIFICATIONS: Record<TradingStyle, { label: string; description: string }> = {
  'scalper': { label: 'Scalper', description: 'High-frequency, rapid trades' },
  'day-trader': { label: 'Day Trader', description: 'Active intraday trading' },
  'swing-trader': { label: 'Swing Trader', description: 'Multi-day positions' },
  'holder': { label: 'Holder', description: 'Long-term strategy' },
};

function classifyTrader(
  fills: TraderFill[],
  stats: TraderStatsResponse | undefined,
): TraderClassification {
  const allStats = stats?.stats['all'];
  const tradeCount = allStats?.tradeCount ?? fills.length;

  if (tradeCount < 2) {
    return { style: 'holder', ...CLASSIFICATIONS['holder'] };
  }

  // Compute median interval between consecutive trades
  const timestamps = fills
    .map((f) => f.timestamp)
    .sort((a, b) => a - b);

  if (timestamps.length < 2) {
    return { style: 'holder', ...CLASSIFICATIONS['holder'] };
  }

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  intervals.sort((a, b) => a - b);
  const medianInterval = intervals[Math.floor(intervals.length / 2)];

  const FIVE_MINUTES = 5 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  if (medianInterval < FIVE_MINUTES) {
    return { style: 'scalper', ...CLASSIFICATIONS['scalper'] };
  }
  if (medianInterval < ONE_HOUR) {
    return { style: 'day-trader', ...CLASSIFICATIONS['day-trader'] };
  }
  if (medianInterval < ONE_DAY * 3) {
    return { style: 'swing-trader', ...CLASSIFICATIONS['swing-trader'] };
  }
  return { style: 'holder', ...CLASSIFICATIONS['holder'] };
}

export function useTraderClassification(
  fills: TraderFill[],
  stats: TraderStatsResponse | undefined,
): TraderClassification {
  return useMemo(() => classifyTrader(fills, stats), [fills, stats]);
}
