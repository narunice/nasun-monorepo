/**
 * TradeStats Component
 * Display trading statistics with period filter, win rate, and P&L summary.
 */

import { useState, useMemo } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { useCostBasis } from '../hooks/useCostBasis';
import { getUnifiedPrice, type TokenSymbol } from '@/lib/prices';
import { computeRiskMetrics } from '../lib/risk-metrics';
import { useNow } from '@/hooks/useNow';
import { SharePnlButton } from '../../social/components/SharePnlButton';

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

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color?: 'default' | 'green' | 'red';
}

function StatCard({ label, value, subValue, color = 'default' }: StatCardProps) {
  const valueColor =
    color === 'green'
      ? 'text-green-600 dark:text-green-400'
      : color === 'red'
      ? 'text-red-600 dark:text-red-400'
      : 'text-theme-text-primary';

  return (
    <div className="bg-theme-bg-tertiary rounded-lg p-3 xl:p-4">
      <div className="text-[10px] xl:text-xs text-theme-text-secondary mb-1">{label}</div>
      <div className={`text-sm xl:text-lg font-semibold ${valueColor}`}>{value}</div>
      {subValue && (
        <div className="text-[10px] xl:text-xs text-theme-text-muted mt-0.5">{subValue}</div>
      )}
    </div>
  );
}

export function TradeStats() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { trades, isLoading } = useTradeHistory();
  const { entries: costBasisEntries } = useCostBasis();
  const [period, setPeriod] = useState<Period>('all');
  const now = useNow();

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = status === 'unlocked' || isZkConnected || isPasskeyUnlocked;

  // Build avg buy price map from cost basis
  const avgBuyPrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of costBasisEntries) {
      map.set(entry.symbol, entry.avgBuyPrice);
    }
    return map;
  }, [costBasisEntries]);

  // Filter trades by period
  const filteredTrades = useMemo(() => {
    if (period === 'all') return trades;
    const cutoff = now - getPeriodMs(period);
    return trades.filter((t) => t.timestamp >= cutoff);
  }, [trades, period, now]);

  // Compute volume stats
  const stats = useMemo(() => {
    const buyTrades = filteredTrades.filter((t) => t.side === 'buy');
    const sellTrades = filteredTrades.filter((t) => t.side === 'sell');
    const buyVolume = buyTrades.reduce((sum, t) => sum + t.total, 0);
    const sellVolume = sellTrades.reduce((sum, t) => sum + t.total, 0);
    const totalVolume = buyVolume + sellVolume;

    return {
      totalTrades: filteredTrades.length,
      totalVolume,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buyVolume,
      sellVolume,
      avgTradeSize: filteredTrades.length > 0 ? totalVolume / filteredTrades.length : 0,
      lastTradeTime: filteredTrades.length > 0
        ? Math.max(...filteredTrades.map((t) => t.timestamp))
        : null,
    };
  }, [filteredTrades]);

  // Compute win rate and P&L
  const pnlStats = useMemo(() => {
    let profitable = 0;
    let losing = 0;
    let totalPnl = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;

    for (const trade of filteredTrades) {
      const baseSymbol = trade.poolName.split('/')[0] as TokenSymbol;
      const avgBuy = avgBuyPrices.get(baseSymbol) ?? 0;
      if (!avgBuy) continue;

      const currentPrice = getUnifiedPrice(baseSymbol);
      const pnl = trade.side === 'buy'
        ? (currentPrice - trade.price) * trade.quantity
        : (trade.price - avgBuy) * trade.quantity;

      totalPnl += pnl;
      if (pnl > bestTrade) bestTrade = pnl;
      if (pnl < worstTrade) worstTrade = pnl;
      if (pnl > 0) profitable++;
      else if (pnl < 0) losing++;
    }

    const total = profitable + losing;
    return {
      winRate: total > 0 ? (profitable / total) * 100 : 0,
      totalPnl: Math.round(totalPnl * 100) / 100,
      bestTrade: bestTrade === -Infinity ? 0 : Math.round(bestTrade * 100) / 100,
      worstTrade: worstTrade === Infinity ? 0 : Math.round(worstTrade * 100) / 100,
      profitableTrades: profitable,
      losingTrades: losing,
    };
  }, [filteredTrades, avgBuyPrices]);

  // Compute advanced risk metrics
  const riskMetrics = useMemo(() => {
    const tradePnls = filteredTrades.map((trade) => {
      const baseSymbol = trade.poolName.split('/')[0] as TokenSymbol;
      const avgBuy = avgBuyPrices.get(baseSymbol) ?? 0;
      if (!avgBuy) return { pnl: 0, timestamp: trade.timestamp };

      const currentPrice = getUnifiedPrice(baseSymbol);
      const pnl = trade.side === 'buy'
        ? (currentPrice - trade.price) * trade.quantity
        : (trade.price - avgBuy) * trade.quantity;
      return { pnl, timestamp: trade.timestamp };
    });
    return computeRiskMetrics(tradePnls);
  }, [filteredTrades, avgBuyPrices]);

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Trading Statistics</h2>
        <div className="text-center text-theme-text-muted py-4">
          Connect wallet to view your trading statistics
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-4">Trading Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-theme-bg-tertiary rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-theme-bg-secondary rounded w-16 mb-2" />
              <div className="h-5 bg-theme-bg-secondary rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const pnlColor = pnlStats.totalPnl >= 0 ? 'green' : 'red' as const;
  const pnlSign = pnlStats.totalPnl >= 0 ? '+' : '';

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-4 xl:p-6">
      {/* Header with period filter */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Trading Statistics</h2>
        <div className="flex items-center gap-2">
          {stats.totalTrades > 0 && (
            <SharePnlButton
              period={PERIOD_LABELS[period]}
              totalPnl={pnlStats.totalPnl}
              totalPnlPct={stats.totalVolume > 0 ? (pnlStats.totalPnl / stats.totalVolume) * 100 : 0}
              winRate={pnlStats.winRate}
              totalTrades={stats.totalTrades}
              totalVolume={stats.totalVolume}
              bestTrade={pnlStats.bestTrade}
              worstTrade={pnlStats.worstTrade}
            />
          )}
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
      </div>

      {/* Primary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xl:gap-3">
        <StatCard
          label="Total P&L"
          value={`${pnlSign}${formatVolume(Math.abs(pnlStats.totalPnl))}`}
          subValue={`${pnlStats.profitableTrades}W / ${pnlStats.losingTrades}L`}
          color={pnlColor}
        />
        <StatCard
          label="Win Rate"
          value={`${pnlStats.winRate.toFixed(1)}%`}
          subValue={`${stats.totalTrades} trades`}
          color={pnlStats.winRate >= 50 ? 'green' : pnlStats.winRate > 0 ? 'red' : 'default'}
        />
        <StatCard
          label="Total Volume"
          value={formatVolume(stats.totalVolume)}
          subValue={`Avg ${formatVolume(stats.avgTradeSize)}`}
        />
        <StatCard
          label="Best / Worst"
          value={pnlStats.bestTrade > 0 ? `+$${pnlStats.bestTrade.toFixed(2)}` : '$0.00'}
          subValue={pnlStats.worstTrade < 0 ? `-$${Math.abs(pnlStats.worstTrade).toFixed(2)}` : '$0.00'}
          color="green"
        />
      </div>

      {/* Secondary stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xl:gap-3 mt-2 xl:mt-3">
        <StatCard
          label="Buy Volume"
          value={formatVolume(stats.buyVolume)}
          subValue={`${stats.buyTrades} buys`}
          color="green"
        />
        <StatCard
          label="Sell Volume"
          value={formatVolume(stats.sellVolume)}
          subValue={`${stats.sellTrades} sells`}
          color="red"
        />
      </div>

      {/* Risk metrics row */}
      {stats.totalTrades > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 xl:gap-3 mt-2 xl:mt-3">
          <StatCard
            label="Sharpe Ratio"
            value={riskMetrics.sharpeRatio.toFixed(2)}
            subValue="Annualized"
            color={riskMetrics.sharpeRatio > 1 ? 'green' : riskMetrics.sharpeRatio < 0 ? 'red' : 'default'}
          />
          <StatCard
            label="Profit Factor"
            value={riskMetrics.profitFactor >= 99.9 ? '99.9+' : riskMetrics.profitFactor.toFixed(2)}
            subValue={riskMetrics.profitFactor >= 1.5 ? 'Strong' : riskMetrics.profitFactor >= 1 ? 'Moderate' : 'Weak'}
            color={riskMetrics.profitFactor >= 1.5 ? 'green' : riskMetrics.profitFactor < 1 ? 'red' : 'default'}
          />
          <StatCard
            label="Avg Win / Loss"
            value={`$${riskMetrics.avgWin.toFixed(2)}`}
            subValue={`Loss: $${riskMetrics.avgLoss.toFixed(2)}`}
            color={riskMetrics.avgWin > riskMetrics.avgLoss ? 'green' : 'red'}
          />
          <StatCard
            label="Expectancy"
            value={`${riskMetrics.expectancy >= 0 ? '+' : ''}$${riskMetrics.expectancy.toFixed(2)}`}
            subValue="Per trade"
            color={riskMetrics.expectancy > 0 ? 'green' : riskMetrics.expectancy < 0 ? 'red' : 'default'}
          />
        </div>
      )}

      <div className="mt-3 xl:mt-4 pt-3 border-t border-theme-border text-xs xl:text-sm text-theme-text-secondary">
        Last trade: {formatTime(stats.lastTradeTime)}
      </div>
    </div>
  );
}
