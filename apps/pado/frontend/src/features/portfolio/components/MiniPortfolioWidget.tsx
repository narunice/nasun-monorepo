/**
 * MiniPortfolioWidget
 * Compact portfolio summary for embedding in the Trading page.
 * Shows total value, 24h PnL, token breakdown, sparkline, trade stats.
 */

import { useMemo } from 'react';
import { useTotalValue } from '../hooks/useTotalValue';
import { useTradeHistory } from '../hooks/useTradeHistory';
import { usePnlTimeSeries, type PnlDataPoint } from '../hooks/usePnlTimeSeries';

// Pure SVG sparkline — no external library needed
function Sparkline({ data, width = 200, height = 32 }: { data: PnlDataPoint[]; width?: number; height?: number }) {
  const svgWidth = width;
  if (data.length < 2) {
    return <div style={{ height }} className="w-full bg-theme-bg-tertiary/30 rounded" />;
  }

  const values = data.map(d => d.cumulativePnl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * svgWidth;
    const y = height - ((d.cumulativePnl - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const isPositive = values[values.length - 1] >= values[0];
  const color = isPositive ? 'var(--color-bid)' : 'var(--color-ask)';

  return (
    <svg viewBox={`0 0 ${svgWidth} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MiniPortfolioWidget() {
  const { totalValue, totalPnl24h, totalChange24h, tokens, isLoading } = useTotalValue();
  const { stats } = useTradeHistory();
  const { data: pnlData, totalRealized } = usePnlTimeSeries('24h');

  // Filter to meaningful tokens (non-zero value)
  const activeTokens = useMemo(
    () => tokens.filter(t => t.value > 0.01).sort((a, b) => b.value - a.value).slice(0, 5),
    [tokens],
  );

  if (isLoading) {
    return (
      <div className="min-h-[180px] flex items-center justify-center">
        <span className="text-theme-text-muted text-sm">Loading portfolio...</span>
      </div>
    );
  }

  return (
    <div className="min-h-[180px] space-y-3">
      {/* Row 1: Total Value + 24h PnL */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-trading-xs text-theme-text-muted">Total Value</div>
          <div className="text-xl font-bold font-mono text-theme-text-primary">
            ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div className="text-right">
          <div className="text-trading-xs text-theme-text-muted">24h P&L</div>
          <div className={`text-sm font-mono font-semibold ${totalPnl24h >= 0 ? 'text-trading-bid' : 'text-trading-ask'}`}>
            {totalPnl24h >= 0 ? '+' : ''}{totalPnl24h.toFixed(2)} USD
          </div>
          <div className={`text-trading-xs font-mono ${totalChange24h >= 0 ? 'text-trading-bid' : 'text-trading-ask'}`}>
            {totalChange24h >= 0 ? '+' : ''}{totalChange24h.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Row 2: PnL Sparkline */}
      {pnlData.length >= 2 && (
        <div className="bg-theme-bg-tertiary/30 rounded p-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-theme-text-muted">Realized P&L (24h)</span>
            <span className={`text-[10px] font-mono ${totalRealized >= 0 ? 'text-trading-bid' : 'text-trading-ask'}`}>
              {totalRealized >= 0 ? '+' : ''}{totalRealized.toFixed(2)}
            </span>
          </div>
          <Sparkline data={pnlData} height={28} />
        </div>
      )}

      {/* Row 3: Token Breakdown */}
      {activeTokens.length > 0 && (
        <div>
          <div className="text-[10px] text-theme-text-muted mb-1">Holdings</div>
          <div className="space-y-0.5">
            {activeTokens.map((token) => (
              <div key={token.symbol} className="flex items-center justify-between text-trading-xs">
                <span className="text-theme-text-secondary font-medium">{token.symbol}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-theme-text-muted">{token.balance}</span>
                  <span className="font-mono text-theme-text-secondary min-w-20 text-right">
                    ${token.value.toFixed(2)}
                  </span>
                  <span className={`font-mono min-w-14 text-right ${token.pnl24h >= 0 ? 'text-trading-bid' : 'text-trading-ask'}`}>
                    {token.pnl24h >= 0 ? '+' : ''}{token.pnl24h.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 4: Trade Stats */}
      <div className="flex items-center gap-4 pt-1 border-t border-theme-border/50">
        <div>
          <div className="text-[10px] text-theme-text-muted">Trades</div>
          <div className="text-trading-xs font-mono text-theme-text-secondary">{stats.totalTrades}</div>
        </div>
        <div>
          <div className="text-[10px] text-theme-text-muted">Volume</div>
          <div className="text-trading-xs font-mono text-theme-text-secondary">
            ${stats.totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-theme-text-muted">Avg Size</div>
          <div className="text-trading-xs font-mono text-theme-text-secondary">
            ${stats.avgTradeSize.toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-theme-text-muted">Buy/Sell</div>
          <div className="text-trading-xs font-mono">
            <span className="text-trading-bid">{stats.buyTrades}</span>
            <span className="text-theme-text-muted">/</span>
            <span className="text-trading-ask">{stats.sellTrades}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
