/**
 * PnlChart Component
 * Equity curve visualization using lightweight-charts AreaSeries.
 * Displays cumulative realized PnL over time with period filter.
 */

import { useEffect, useRef, useState } from 'react';
import { createChart, AreaSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useTheme } from '../../../providers/theme';
import { usePnlTimeSeries, type PnlPeriod } from '../hooks/usePnlTimeSeries';
import { useCostBasis } from '../hooks/useCostBasis';

const CHART_HEIGHT = 200;

const PERIOD_LABELS: Record<PnlPeriod, string> = {
  '24h': '24H',
  '7d': '7D',
  '30d': '30D',
  'all': 'All',
};

const COLORS = {
  dark: {
    background: '#0d141e',
    text: '#d1d4dc',
    grid: '#1a2332',
    positive: '#26a69a',
    positiveFill: 'rgba(38, 166, 154, 0.15)',
    negative: '#ef5350',
    negativeFill: 'rgba(239, 83, 80, 0.15)',
  },
  light: {
    background: '#f8fafc',
    text: '#191615',
    grid: '#e2e8f0',
    positive: '#22c55e',
    positiveFill: 'rgba(34, 197, 94, 0.15)',
    negative: '#ef4444',
    negativeFill: 'rgba(239, 68, 68, 0.15)',
  },
} as const;

export function PnlChart() {
  const { status } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { theme } = useTheme();
  const [period, setPeriod] = useState<PnlPeriod>('all');
  const { data, maxDrawdown, isLoading } = usePnlTimeSeries(period);
  const { totalRealizedPnl, totalUnrealizedPnl, totalPnl } = useCostBasis();

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const isConnected = status === 'unlocked' || isZkConnected || isPasskeyUnlocked;
  const colors = COLORS[theme];
  const hasData = !isLoading && data.length > 0;

  // Create / destroy chart
  useEffect(() => {
    if (!containerRef.current || !hasData) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: CHART_HEIGHT,
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
        fontFamily: "'Rubik', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      rightPriceScale: {
        borderColor: colors.grid,
      },
      timeScale: {
        borderColor: colors.grid,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        horzLine: { visible: true, labelVisible: true },
        vertLine: { visible: true, labelVisible: true },
      },
    });

    chartRef.current = chart;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) chart.applyOptions({ width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [theme, hasData]); // eslint-disable-line react-hooks/exhaustive-deps -- recreate on theme change or data availability

  // Update data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove old series
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    if (data.length === 0) return;

    const lastPnl = data[data.length - 1]?.cumulativePnl ?? 0;
    const isPositive = lastPnl >= 0;

    const series = chart.addSeries(AreaSeries, {
      lineColor: isPositive ? colors.positive : colors.negative,
      topColor: isPositive ? colors.positiveFill : colors.negativeFill,
      bottomColor: 'transparent',
      lineWidth: 2,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => `$${price.toFixed(2)}`,
      },
      baseLineVisible: true,
      baseLineColor: colors.grid,
      baseLineStyle: 2,
      crosshairMarkerVisible: true,
    });

    // Convert timestamps to lightweight-charts Time format (seconds)
    // Deduplicate: keep last entry per second (lightweight-charts requires strictly ascending time)
    const chartDataMap = new Map<number, { time: Time; value: number }>();
    for (const d of data) {
      const sec = Math.floor(d.time / 1000);
      chartDataMap.set(sec, { time: sec as unknown as Time, value: d.cumulativePnl });
    }
    const chartData = Array.from(chartDataMap.values());

    series.setData(chartData);
    seriesRef.current = series;
    chart.timeScale().fitContent();
  }, [data, colors]);

  if (!isConnected) {
    return (
      <div className="bg-theme-bg-secondary rounded-lg p-6">
        <h2 className="font-semibold mb-2">P&L Chart</h2>
        <div className="text-center text-theme-text-muted py-8">
          Connect wallet to view your P&L chart
        </div>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg overflow-hidden">
      {/* Header with period filter */}
      <div className="px-4 py-3 border-b border-theme-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">P&L Chart</h2>
          {data.length > 0 && (
            <span className={`text-sm font-medium ${
              totalPnl >= 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}>
              {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
            </span>
          )}
        </div>
        <div className="flex gap-1 bg-theme-bg-tertiary rounded-lg p-0.5">
          {(Object.keys(PERIOD_LABELS) as PnlPeriod[]).map((p) => (
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

      {/* PnL breakdown stats */}
      {data.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-4 text-xs border-b border-theme-border/50">
          <div>
            <span className="text-theme-text-muted">Realized </span>
            <span className={totalRealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {totalRealizedPnl >= 0 ? '+' : ''}${totalRealizedPnl.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-theme-text-muted">Unrealized </span>
            <span className={totalUnrealizedPnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
              {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
            </span>
          </div>
          {maxDrawdown < 0 && (
            <div>
              <span className="text-theme-text-muted">Max Drawdown </span>
              <span className="text-red-600 dark:text-red-400">${maxDrawdown.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* Chart area - always render container so ref is available */}
      <div
        ref={containerRef}
        style={{ height: hasData ? undefined : 0, overflow: 'hidden' }}
      />
      {isLoading && (
        <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
          <span className="text-theme-text-muted">Loading...</span>
        </div>
      )}
      {!isLoading && data.length === 0 && (
        <div className="flex items-center justify-center" style={{ height: CHART_HEIGHT }}>
          <span className="text-theme-text-muted">Start trading to see your P&L chart</span>
        </div>
      )}
    </div>
  );
}
