/**
 * useOverlayIndicators - Manages overlay indicators on the main chart
 *
 * Handles SMA, EMA, and Bollinger Bands line series:
 * - Creates/removes series based on indicator state
 * - Updates data when candle data changes
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { LineSeries } from 'lightweight-charts';
import type { IndicatorState } from '../types';
import {
  calculateMA,
  calculateEMALine,
  calculateBollingerBands,
} from '@/lib/indicators';

interface OverlayRefs {
  sma5: ISeriesApi<'Line'> | null;
  sma20: ISeriesApi<'Line'> | null;
  ema9: ISeriesApi<'Line'> | null;
  ema21: ISeriesApi<'Line'> | null;
  bbUpper: ISeriesApi<'Line'> | null;
  bbLower: ISeriesApi<'Line'> | null;
}

interface UseOverlayIndicatorsConfig {
  chartRef: RefObject<IChartApi | null>;
  indicators: IndicatorState;
  candleData: CandlestickData[];
}

export function useOverlayIndicators({
  chartRef,
  indicators,
  candleData,
}: UseOverlayIndicatorsConfig): void {
  const seriesRefs = useRef<OverlayRefs>({
    sma5: null, sma20: null,
    ema9: null, ema21: null,
    bbUpper: null, bbLower: null,
  });

  // SMA lines
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const refs = seriesRefs.current;

    if (indicators.sma.enabled) {
      if (!refs.sma5) {
        refs.sma5 = chart.addSeries(LineSeries, {
          color: '#fbbf24', lineWidth: 1, priceLineVisible: false,
          lastValueVisible: false, crosshairMarkerVisible: false,
        });
      }
      if (!refs.sma20) {
        refs.sma20 = chart.addSeries(LineSeries, {
          color: '#3b82f6', lineWidth: 1, priceLineVisible: false,
          lastValueVisible: false, crosshairMarkerVisible: false,
        });
      }
      if (candleData.length > 0) {
        const p1 = indicators.sma.params?.period1 ?? 5;
        const p2 = indicators.sma.params?.period2 ?? 20;
        refs.sma5.setData(calculateMA(candleData, p1));
        refs.sma20.setData(calculateMA(candleData, p2));
      }
    } else {
      if (refs.sma5) { try { chart.removeSeries(refs.sma5); } catch { /* chart may be destroyed */ } refs.sma5 = null; }
      if (refs.sma20) { try { chart.removeSeries(refs.sma20); } catch { /* chart may be destroyed */ } refs.sma20 = null; }
    }
  }, [indicators.sma.enabled, candleData, chartRef]);

  // EMA lines
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const refs = seriesRefs.current;

    if (indicators.ema.enabled) {
      if (!refs.ema9) {
        refs.ema9 = chart.addSeries(LineSeries, {
          color: '#f97316', lineWidth: 1, priceLineVisible: false,
          lastValueVisible: false, crosshairMarkerVisible: false,
        });
      }
      if (!refs.ema21) {
        refs.ema21 = chart.addSeries(LineSeries, {
          color: '#8b5cf6', lineWidth: 1, priceLineVisible: false,
          lastValueVisible: false, crosshairMarkerVisible: false,
        });
      }
      if (candleData.length > 0) {
        const p1 = indicators.ema.params?.period1 ?? 9;
        const p2 = indicators.ema.params?.period2 ?? 21;
        refs.ema9.setData(calculateEMALine(candleData, p1));
        refs.ema21.setData(calculateEMALine(candleData, p2));
      }
    } else {
      if (refs.ema9) { try { chart.removeSeries(refs.ema9); } catch { /* chart may be destroyed */ } refs.ema9 = null; }
      if (refs.ema21) { try { chart.removeSeries(refs.ema21); } catch { /* chart may be destroyed */ } refs.ema21 = null; }
    }
  }, [indicators.ema.enabled, candleData, chartRef]);

  // Bollinger Bands
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const refs = seriesRefs.current;

    if (indicators.bb.enabled) {
      if (!refs.bbUpper) {
        refs.bbUpper = chart.addSeries(LineSeries, {
          color: '#6366f1', lineWidth: 1, lineStyle: 2, // dashed
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
      }
      if (!refs.bbLower) {
        refs.bbLower = chart.addSeries(LineSeries, {
          color: '#6366f1', lineWidth: 1, lineStyle: 2, // dashed
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
      }
      if (candleData.length > 0) {
        const period = indicators.bb.params?.period ?? 20;
        const stddev = indicators.bb.params?.stddev ?? 2;
        const bb = calculateBollingerBands(candleData, period, stddev);
        refs.bbUpper.setData(bb.upper);
        refs.bbLower.setData(bb.lower);
      }
    } else {
      if (refs.bbUpper) { try { chart.removeSeries(refs.bbUpper); } catch { /* chart may be destroyed */ } refs.bbUpper = null; }
      if (refs.bbLower) { try { chart.removeSeries(refs.bbLower); } catch { /* chart may be destroyed */ } refs.bbLower = null; }
    }
  }, [indicators.bb.enabled, candleData, chartRef]);

  // Cleanup all series on unmount
  useEffect(() => {
    return () => {
      const chart = chartRef.current;
      if (!chart) return;
      const refs = seriesRefs.current;
      for (const key of Object.keys(refs) as (keyof OverlayRefs)[]) {
        if (refs[key]) {
          try { chart.removeSeries(refs[key]!); } catch { /* chart may already be removed */ }
          refs[key] = null;
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
