/**
 * usePnlTimeSeries Hook
 * Convert trade history into cumulative realized PnL time series data
 * for equity curve visualization.
 */

import { useMemo } from 'react';
import { useTradeHistory, type UserTrade } from './useTradeHistory';

export type PnlPeriod = '24h' | '7d' | '30d' | 'all';

const PERIOD_MS: Record<PnlPeriod, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': Infinity,
};

export interface PnlDataPoint {
  time: number;
  cumulativePnl: number;
}

export interface UsePnlTimeSeriesResult {
  data: PnlDataPoint[];
  totalRealized: number;
  maxDrawdown: number;
  isLoading: boolean;
}

/**
 * Calculate max drawdown (peak-to-trough) from PnL series.
 * Returns the worst drop as a dollar amount (negative or zero).
 */
export function calcMaxDrawdown(data: PnlDataPoint[]): number {
  if (data.length === 0) return 0;
  let peak = data[0].cumulativePnl;
  let maxDd = 0;
  for (const d of data) {
    if (d.cumulativePnl > peak) peak = d.cumulativePnl;
    const dd = d.cumulativePnl - peak;
    if (dd < maxDd) maxDd = dd;
  }
  return Math.round(maxDd * 100) / 100;
}

/**
 * Calculate cumulative realized PnL from trade history.
 * Uses weighted average cost basis: buys update avg price, sells realize PnL.
 */
export function buildPnlSeries(trades: UserTrade[]): PnlDataPoint[] {
  if (trades.length === 0) return [];

  // Process chronologically (oldest first)
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  // Track per-token avg buy price and holdings
  const holdings = new Map<string, { avgPrice: number; qty: number }>();
  let cumulativePnl = 0;
  const points: PnlDataPoint[] = [];

  for (const trade of sorted) {
    const token = trade.poolName.split('/')[0];
    const h = holdings.get(token) ?? { avgPrice: 0, qty: 0 };

    if (trade.side === 'buy') {
      // Update weighted average buy price
      const newQty = h.qty + trade.quantity;
      if (newQty > 0) {
        h.avgPrice = (h.avgPrice * h.qty + trade.price * trade.quantity) / newQty;
      }
      h.qty = newQty;
      // Deduct fees from PnL
      cumulativePnl -= trade.fee;
    } else {
      // Sell: realize PnL = (sell price - avg buy price) * quantity - fee
      const pnl = (trade.price - h.avgPrice) * trade.quantity - trade.fee;
      cumulativePnl += pnl;
      h.qty = Math.max(0, h.qty - trade.quantity);
    }

    holdings.set(token, h);
    points.push({
      time: trade.timestamp,
      cumulativePnl: Math.round(cumulativePnl * 100) / 100,
    });
  }

  return points;
}

export function usePnlTimeSeries(period: PnlPeriod): UsePnlTimeSeriesResult {
  const { trades, isLoading } = useTradeHistory();

  const allData = useMemo(() => buildPnlSeries(trades), [trades]);

  const data = useMemo(() => {
    if (period === 'all') return allData;
    const cutoff = Date.now() - PERIOD_MS[period];
    return allData.filter((d) => d.time >= cutoff);
  }, [allData, period]);

  const totalRealized = data.length > 0 ? data[data.length - 1].cumulativePnl : 0;
  const maxDrawdown = useMemo(() => calcMaxDrawdown(data), [data]);

  return { data, totalRealized, maxDrawdown, isLoading };
}
