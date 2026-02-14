/**
 * AssetOverview Component
 * Display total asset value in USD with 24h PnL and All Time PnL
 */

import { useCallback } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { useTotalValue } from '../hooks';
import { useCostBasis } from '../hooks/useCostBasis';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { generateCsv, generateMultiSectionCsv, downloadCsv } from '@/lib/csv-export';
import { SharePortfolioButton } from '../../social/components/SharePortfolioButton';

export function AssetOverview() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { totalValue, totalPnl24h, totalChange24h, tokens, isLoading } = useTotalValue();
  const { totalPnl, totalRealizedPnl, totalUnrealizedPnl, entries: costEntries, isLoading: isPnlLoading } = useCostBasis();
  const { trades, stats: tradeStats } = useTradeHistory();

  const isConnected = status === 'unlocked' || isZkConnected;

  const handleExport = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);

    // Section 1: Summary
    const summaryCsv = generateCsv(
      [{ date, totalValue, totalPnl24h, totalRealizedPnl, totalUnrealizedPnl, totalPnl }],
      [
        { header: 'Date', accessor: (r) => r.date },
        { header: 'Total Value (USD)', accessor: (r) => r.totalValue.toFixed(2) },
        { header: '24h P&L (USD)', accessor: (r) => r.totalPnl24h.toFixed(2) },
        { header: 'Realized P&L', accessor: (r) => r.totalRealizedPnl.toFixed(2) },
        { header: 'Unrealized P&L', accessor: (r) => r.totalUnrealizedPnl.toFixed(2) },
        { header: 'All Time P&L', accessor: (r) => r.totalPnl.toFixed(2) },
      ],
    );

    // Section 2: Holdings
    const holdingsData = tokens.filter((t) => t.value > 0);
    const holdingsCsv = generateCsv(holdingsData, [
      { header: 'Token', accessor: (r) => r.symbol },
      { header: 'Balance', accessor: (r) => r.balance },
      { header: 'Price (USD)', accessor: (r) => r.price.toFixed(2) },
      { header: 'Value (USD)', accessor: (r) => r.value.toFixed(2) },
      { header: 'Allocation %', accessor: (r) => totalValue > 0 ? ((r.value / totalValue) * 100).toFixed(1) : '0.0' },
    ]);

    // Section 3: Per-Market Performance
    const marketMap = new Map<string, { trades: number; volume: number; pnl: number }>();
    for (const trade of trades) {
      const existing = marketMap.get(trade.poolName) ?? { trades: 0, volume: 0, pnl: 0 };
      existing.trades++;
      existing.volume += trade.total;
      marketMap.set(trade.poolName, existing);
    }
    for (const entry of costEntries) {
      const key = `${entry.symbol}/NUSDC`;
      const existing = marketMap.get(key);
      if (existing) {
        existing.pnl = entry.realizedPnl + entry.unrealizedPnl;
      }
    }
    const marketData = Array.from(marketMap.entries()).map(([name, d]) => ({ name, ...d }));
    const marketCsv = generateCsv(marketData, [
      { header: 'Market', accessor: (r) => r.name },
      { header: 'Trades', accessor: (r) => r.trades },
      { header: 'Volume (USD)', accessor: (r) => r.volume.toFixed(2) },
      { header: 'P&L (USD)', accessor: (r) => r.pnl.toFixed(2) },
    ]);

    // Section 4: Trading Stats
    const statsCsv = generateCsv(
      [{ totalTrades: tradeStats.totalTrades, totalVolume: tradeStats.totalVolume, avgSize: tradeStats.avgTradeSize }],
      [
        { header: 'Total Trades', accessor: (r) => r.totalTrades },
        { header: 'Total Volume (USD)', accessor: (r) => r.totalVolume.toFixed(2) },
        { header: 'Avg Trade Size', accessor: (r) => r.avgSize.toFixed(2) },
      ],
    );

    const csv = generateMultiSectionCsv([
      { title: 'Portfolio Summary', csv: summaryCsv },
      { title: 'Holdings', csv: holdingsCsv },
      { title: 'Per-Market Performance', csv: marketCsv },
      { title: 'Trading Statistics', csv: statsCsv },
    ]);
    downloadCsv(csv, `pado-portfolio-${date}.csv`);
  }, [totalValue, totalPnl24h, totalRealizedPnl, totalUnrealizedPnl, totalPnl, tokens, trades, costEntries, tradeStats]);
  const isPositive = totalChange24h >= 0;
  const changeColor = totalChange24h === 0 ? 'text-theme-text-secondary' : isPositive ? 'text-green-400' : 'text-red-400';

  const allTimePnlColor = totalPnl === 0 ? 'text-theme-text-secondary' : totalPnl > 0 ? 'text-green-400' : 'text-red-400';

  // Format the 24h change in a friendly way
  const formatPnl24h = () => {
    const sign = isPositive ? '+' : '-';
    const amount = Math.abs(totalPnl24h).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `Today ${sign}$${amount}`;
  };

  const formatAllTimePnl = (value: number) => {
    const sign = value >= 0 ? '+' : '-';
    const amount = Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}$${amount}`;
  };

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <div className="text-sm text-theme-text-secondary">My Assets</div>
        <div className="text-3xl font-bold mt-2 text-theme-text-muted">--</div>
        <div className="text-sm text-theme-text-muted mt-2">
          Connect to see your balance
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-theme-text-secondary">My Assets</div>
        <div className="flex items-center gap-1">
          {!isLoading && totalValue > 0 && (
            <SharePortfolioButton
              totalValue={totalValue}
              pnl24h={totalPnl24h}
              change24h={totalChange24h}
              tokens={tokens.map(t => ({ symbol: t.symbol, value: t.value }))}
              totalTrades={trades.length}
              totalVolume={trades.reduce((s, t) => s + t.total, 0)}
            />
          )}
          <button
            onClick={handleExport}
            className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors px-2 py-1 rounded hover:bg-theme-bg-tertiary"
            title="Export portfolio as CSV"
          >
            Export
          </button>
        </div>
      </div>
      <div className="text-3xl font-bold mt-2">
        {isLoading ? (
          <div className="h-9 w-40 bg-theme-bg-tertiary rounded animate-pulse" />
        ) : (
          `$${totalValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        )}
      </div>
      {!isLoading && totalValue > 0 && (
        <div className={`mt-2 ${changeColor}`}>
          <span className="text-sm font-medium">{formatPnl24h()}</span>
        </div>
      )}
      {!isPnlLoading && (totalRealizedPnl !== 0 || totalUnrealizedPnl !== 0) && (
        <div className="mt-3 pt-3 border-t border-theme-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-theme-text-muted">All Time P&L</span>
            <span className={`text-sm font-semibold ${allTimePnlColor}`}>
              {formatAllTimePnl(totalPnl)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-theme-text-muted">Realized</span>
            <span className={`text-xs ${totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatAllTimePnl(totalRealizedPnl)}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-theme-text-muted">Unrealized</span>
            <span className={`text-xs ${totalUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatAllTimePnl(totalUnrealizedPnl)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
