/**
 * MarketPerformance Component
 * Per-market performance table showing P&L, volume, win rate per pool.
 * Reuses useTradeHistory + useCostBasis data — no additional fetches.
 */

import { useState, useMemo } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTradeHistory, type UserTrade } from '../hooks/useTradeHistory';
import { useCostBasis } from '../hooks/useCostBasis';
import { getUnifiedPrice, type TokenSymbol } from '@/lib/prices';

type Period = '24h' | '7d' | '30d' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  'all': 'All',
};

function getPeriodMs(period: Period): number {
  switch (period) {
    case '24h': return 24 * 60 * 60 * 1000;
    case '7d': return 7 * 24 * 60 * 60 * 1000;
    case '30d': return 30 * 24 * 60 * 60 * 1000;
    case 'all': return Infinity;
  }
}

interface MarketStats {
  poolName: string;
  totalTrades: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  winRate: number;
  avgBuyPrice: number;
  currentPrice: number;
}

function computeMarketStats(
  trades: UserTrade[],
  avgBuyPrices: Map<string, number>,
): MarketStats[] {
  const byPool = new Map<string, UserTrade[]>();
  for (const trade of trades) {
    const existing = byPool.get(trade.poolName) ?? [];
    existing.push(trade);
    byPool.set(trade.poolName, existing);
  }

  const stats: MarketStats[] = [];
  for (const [poolName, poolTrades] of byPool) {
    const baseSymbol = poolName.split('/')[0] as TokenSymbol;
    const avgBuy = avgBuyPrices.get(baseSymbol) ?? 0;
    const currentPrice = getUnifiedPrice(baseSymbol);

    let buyVolume = 0;
    let sellVolume = 0;
    let wins = 0;
    let losses = 0;
    let realizedPnl = 0;

    for (const trade of poolTrades) {
      if (trade.side === 'buy') {
        buyVolume += trade.total;
        if (avgBuy > 0) {
          const pnl = (currentPrice - trade.price) * trade.quantity;
          if (pnl > 0) wins++;
          else if (pnl < 0) losses++;
        }
      } else {
        sellVolume += trade.total;
        if (avgBuy > 0) {
          const pnl = (trade.price - avgBuy) * trade.quantity;
          realizedPnl += pnl;
          if (pnl > 0) wins++;
          else if (pnl < 0) losses++;
        }
      }
    }

    const totalWL = wins + losses;
    const totalVolume = buyVolume + sellVolume;

    // Unrealized PnL from cost basis (buy trades at current prices vs entry)
    const buyTrades = poolTrades.filter((t) => t.side === 'buy');
    const holdingQty = buyTrades.reduce((sum, t) => sum + t.quantity, 0)
      - poolTrades.filter((t) => t.side === 'sell').reduce((sum, t) => sum + t.quantity, 0);
    const unrealizedPnl = holdingQty > 0 && avgBuy > 0
      ? (currentPrice - avgBuy) * holdingQty
      : 0;

    stats.push({
      poolName,
      totalTrades: poolTrades.length,
      buyVolume,
      sellVolume,
      totalVolume,
      realizedPnl: Math.round(realizedPnl * 100) / 100,
      unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
      totalPnl: Math.round((realizedPnl + unrealizedPnl) * 100) / 100,
      winRate: totalWL > 0 ? Math.round((wins / totalWL) * 1000) / 10 : 0,
      avgBuyPrice: Math.round(avgBuy * 100) / 100,
      currentPrice: Math.round(currentPrice * 100) / 100,
    });
  }

  // Sort by volume descending
  return stats.sort((a, b) => b.totalVolume - a.totalVolume);
}

function formatUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function pnlColor(value: number): string {
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-theme-text-secondary';
}

export function MarketPerformance() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { trades, isLoading } = useTradeHistory();
  const { entries: costBasisEntries } = useCostBasis();
  const [period, setPeriod] = useState<Period>('all');

  const isConnected = status === 'unlocked' || isZkConnected;

  const avgBuyPrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of costBasisEntries) {
      map.set(entry.symbol, entry.avgBuyPrice);
    }
    return map;
  }, [costBasisEntries]);

  const filteredTrades = useMemo(() => {
    if (period === 'all') return trades;
    const cutoff = Date.now() - getPeriodMs(period);
    return trades.filter((t) => t.timestamp >= cutoff);
  }, [trades, period]);

  const marketStats = useMemo(
    () => computeMarketStats(filteredTrades, avgBuyPrices),
    [filteredTrades, avgBuyPrices],
  );

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Market Performance</h2>
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to view market performance
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Market Performance</h2>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-theme-bg-tertiary rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (marketStats.length === 0) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Market Performance</h2>
        <div className="text-center text-theme-text-muted py-4">
          Start trading to see market performance
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-4 xl:p-6">
      {/* Header with period filter */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Market Performance</h2>
        <div className="flex gap-1 bg-theme-bg-tertiary rounded-lg p-0.5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                period === p
                  ? 'bg-pd1 text-white font-medium'
                  : 'text-theme-text-muted hover:text-theme-text-secondary'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-theme-text-muted border-b border-theme-border">
              <th className="text-left py-2 font-medium">Market</th>
              <th className="text-right py-2 font-medium">Trades</th>
              <th className="text-right py-2 font-medium">Volume</th>
              <th className="text-right py-2 font-medium">P&L</th>
              <th className="text-right py-2 font-medium">Win Rate</th>
              <th className="text-right py-2 font-medium">Avg Buy</th>
              <th className="text-right py-2 font-medium">Current</th>
            </tr>
          </thead>
          <tbody>
            {marketStats.map((m) => (
              <tr key={m.poolName} className="border-b border-theme-border/50 last:border-0">
                <td className="py-2.5 font-medium">{m.poolName}</td>
                <td className="py-2.5 text-right text-theme-text-secondary">{m.totalTrades}</td>
                <td className="py-2.5 text-right">{formatUsd(m.totalVolume)}</td>
                <td className={`py-2.5 text-right font-medium ${pnlColor(m.totalPnl)}`}>
                  {m.totalPnl >= 0 ? '+' : ''}{formatUsd(m.totalPnl)}
                </td>
                <td className={`py-2.5 text-right ${m.winRate >= 50 ? 'text-green-600 dark:text-green-400' : m.winRate > 0 ? 'text-red-600 dark:text-red-400' : 'text-theme-text-secondary'}`}>
                  {m.winRate.toFixed(1)}%
                </td>
                <td className="py-2.5 text-right text-theme-text-secondary">
                  {m.avgBuyPrice > 0 ? formatUsd(m.avgBuyPrice) : '-'}
                </td>
                <td className="py-2.5 text-right">{formatUsd(m.currentPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="md:hidden space-y-3">
        {marketStats.map((m) => (
          <div key={m.poolName} className="bg-theme-bg-tertiary rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{m.poolName}</span>
              <span className={`text-sm font-medium ${pnlColor(m.totalPnl)}`}>
                {m.totalPnl >= 0 ? '+' : ''}{formatUsd(m.totalPnl)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-theme-text-muted">Trades</div>
                <div>{m.totalTrades}</div>
              </div>
              <div>
                <div className="text-theme-text-muted">Volume</div>
                <div>{formatUsd(m.totalVolume)}</div>
              </div>
              <div>
                <div className="text-theme-text-muted">Win Rate</div>
                <div className={m.winRate >= 50 ? 'text-green-400' : m.winRate > 0 ? 'text-red-400' : ''}>
                  {m.winRate.toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
