/**
 * useSubChart - Generic hook for creating synced sub-charts (RSI, MACD, Stochastic, ATR)
 *
 * Extracts the repeated pattern of:
 * 1. Create chart when enabled
 * 2. Run setup callback (add series, set data, add price lines)
 * 3. Sync timescale with main chart
 * 4. Handle resize
 * 5. Destroy chart when disabled or unmounted
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createChart } from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import type { CHART_COLORS } from '../types';

interface UseSubChartConfig {
  containerRef: RefObject<HTMLDivElement | null>;
  enabled: boolean;
  mainChartRef: RefObject<IChartApi | null>;
  colors: (typeof CHART_COLORS)[keyof typeof CHART_COLORS];
  height: number;
  setup: (chart: IChartApi) => void;
  deps: unknown[];
}

export function useSubChart({
  containerRef,
  enabled,
  mainChartRef,
  colors,
  height,
  setup,
  deps,
}: UseSubChartConfig): void {
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    // Destroy existing chart before re-creating (or when disabled)
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    if (!enabled || !containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: colors.background }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      width: containerRef.current.clientWidth,
      height,
      timeScale: { visible: false, barSpacing: 4 },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      crosshair: { mode: 1 },
    });

    chartRef.current = chart;

    // Run caller's setup (add series, set data, etc.)
    setup(chart);

    // Sync timescale with main chart
    const mainChart = mainChartRef.current;
    let syncHandler: ((range: unknown) => void) | null = null;
    if (mainChart) {
      syncHandler = (range: unknown) => {
        if (range && chartRef.current) {
          chartRef.current.timeScale().setVisibleLogicalRange(range as { from: number; to: number });
        }
      };
      mainChart.timeScale().subscribeVisibleLogicalRangeChange(syncHandler);
    }

    chart.timeScale().fitContent();

    // Resize handler
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (syncHandler && mainChart) {
        try { mainChart.timeScale().unsubscribeVisibleLogicalRangeChange(syncHandler); } catch { /* main chart may be removed */ }
      }
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, colors, height, ...deps]);
}
