/**
 * PriceChart - TradingView-style candlestick chart with indicators
 *
 * Decomposed into:
 * - ChartHeader: interval/indicator controls
 * - OhlcvOverlay: crosshair OHLCV display
 * - useChartData: Binance/simulated data fetching
 * - Chart rendering: main candle, volume, RSI, MACD
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time, MouseEventParams } from 'lightweight-charts';
import { useMarket } from '../../context/MarketContext';
import { useTheme } from '../../../../providers/theme';
import {
  calculateMA,
  calculateRSI,
  calculateMACD,
  generateVolumeData,
} from '@/lib/indicators';
import { useChartData } from './hooks/useChartData';
import { ChartHeader } from './ChartHeader';
import { OhlcvOverlay } from './OhlcvOverlay';
import type { TimeInterval, IndicatorState, OhlcvData } from './types';
import { CHART_COLORS, CHART_HEIGHT, VOLUME_HEIGHT, RSI_HEIGHT, MACD_HEIGHT } from './types';

// Re-export TimeInterval for backward compatibility
export type { TimeInterval } from './types';

interface PriceChartProps {
  currentPrice?: number;
  className?: string;
}

export function PriceChart({ currentPrice = 95000, className = '' }: PriceChartProps) {
  const { currentPool } = useMarket();
  const { theme } = useTheme();
  const baseSymbol = currentPool.baseToken.symbol;
  const colors = CHART_COLORS[theme];

  // State (persisted to localStorage)
  const [interval, setInterval] = useState<TimeInterval>(() => {
    const stored = localStorage.getItem('pado:chart:interval');
    return (stored && ['1m', '5m', '15m', '1h', '4h', '1d'].includes(stored)) ? stored as TimeInterval : '15m';
  });
  const [indicators, setIndicators] = useState<IndicatorState>(() => {
    try {
      const stored = localStorage.getItem('pado:chart:indicators');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.ma === 'boolean' && typeof parsed.rsi === 'boolean' && typeof parsed.macd === 'boolean') {
          // Only pick expected keys to prevent prototype pollution from tampered localStorage
          return { ma: parsed.ma, rsi: parsed.rsi, macd: parsed.macd };
        }
      }
    } catch { /* ignore corrupt data */ }
    return { ma: true, rsi: false, macd: false };
  });
  const [lastPrice, setLastPrice] = useState<{ value: number; change: number } | null>(null);
  const [ohlcv, setOhlcv] = useState<OhlcvData | null>(null);

  // Data
  const { effectiveCandleData, binanceSymbol, intervalMs } = useChartData(baseSymbol, interval, currentPrice);

  // Chart refs
  const mainChartWrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const macdHistSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);

  // Persist interval and indicators to localStorage
  useEffect(() => { localStorage.setItem('pado:chart:interval', interval); }, [interval]);
  useEffect(() => { localStorage.setItem('pado:chart:indicators', JSON.stringify(indicators)); }, [indicators]);

  const handleToggleIndicator = useCallback((key: keyof IndicatorState) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // === Initialize main chart + volume chart ===
  useEffect(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current || !mainChartWrapperRef.current) return;

    // Use wrapper's measured height (flex-1 fills remaining space)
    const initialHeight = mainChartWrapperRef.current.clientHeight || CHART_HEIGHT;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: colors.background }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      width: chartContainerRef.current.clientWidth,
      height: initialHeight,
      timeScale: { timeVisible: true, secondsVisible: false, barSpacing: 4 },
      rightPriceScale: { borderColor: colors.border },
      crosshair: { mode: 1 },
      localization: {
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleString('en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        },
      },
    });

    const volumeChart = createChart(volumeContainerRef.current, {
      layout: { background: { color: colors.background }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { visible: false } },
      width: volumeContainerRef.current.clientWidth,
      height: VOLUME_HEIGHT,
      timeScale: { visible: false, barSpacing: 4 },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0 } },
      crosshair: { mode: 1 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.candleUp, downColor: colors.candleDown,
      borderDownColor: colors.candleDown, borderUpColor: colors.candleUp,
      wickDownColor: colors.candleDown, wickUpColor: colors.candleUp,
    });

    const ma5Series = chart.addSeries(LineSeries, {
      color: '#fbbf24', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    const ma20Series = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });

    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'right',
    });

    chartRef.current = chart;
    volumeChartRef.current = volumeChart;
    candleSeriesRef.current = candleSeries;
    ma5SeriesRef.current = ma5Series;
    ma20SeriesRef.current = ma20Series;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair → OHLCV overlay
    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      if (!param.time || !param.seriesData) { setOhlcv(null); return; }
      const cv = param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined;
      const vv = param.seriesData.get(volumeSeries) as { value: number } | undefined;
      if (cv) setOhlcv({ ...cv, volume: vv?.value ?? 0 });
    });

    // Sync timescales
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) volumeChart.timeScale().setVisibleLogicalRange(range);
    });
    volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) chart.timeScale().setVisibleLogicalRange(range);
    });

    // Resize: update width + main chart height from wrapper
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
      if (mainChartWrapperRef.current && chartRef.current) {
        chartRef.current.applyOptions({ height: mainChartWrapperRef.current.clientHeight });
      }
      if (volumeContainerRef.current && volumeChartRef.current) {
        volumeChartRef.current.applyOptions({ width: volumeContainerRef.current.clientWidth });
      }
    };

    // ResizeObserver for dynamic height tracking (parent container changes)
    const resizeObserver = new ResizeObserver(handleResize);
    if (mainChartWrapperRef.current) resizeObserver.observe(mainChartWrapperRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.remove();
      volumeChart.remove();
    };
  }, []);

  // === Update data ===
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || effectiveCandleData.length === 0) return;

    candleSeriesRef.current.setData(effectiveCandleData);

    if (ma5SeriesRef.current && ma20SeriesRef.current) {
      ma5SeriesRef.current.setData(calculateMA(effectiveCandleData, 5));
      ma20SeriesRef.current.setData(calculateMA(effectiveCandleData, 20));
    }

    volumeSeriesRef.current.setData(generateVolumeData(effectiveCandleData, colors.volumeUp, colors.volumeDown));

    if (effectiveCandleData.length > 1) {
      const last = effectiveCandleData[effectiveCandleData.length - 1];
      const prev = effectiveCandleData[effectiveCandleData.length - 2];
      setLastPrice({ value: last.close, change: ((last.close - prev.close) / prev.close) * 100 });
    }

    chartRef.current?.timeScale().fitContent();
    volumeChartRef.current?.timeScale().fitContent();
  }, [effectiveCandleData]);

  // === MA visibility toggle ===
  useEffect(() => {
    ma5SeriesRef.current?.applyOptions({ visible: indicators.ma });
    ma20SeriesRef.current?.applyOptions({ visible: indicators.ma });
  }, [indicators.ma]);

  // === RSI chart ===
  useEffect(() => {
    if (!indicators.rsi || !rsiContainerRef.current) {
      if (rsiChartRef.current) { rsiChartRef.current.remove(); rsiChartRef.current = null; rsiSeriesRef.current = null; }
      return;
    }

    const rsiChart = createChart(rsiContainerRef.current, {
      layout: { background: { color: colors.background }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      width: rsiContainerRef.current.clientWidth, height: RSI_HEIGHT,
      timeScale: { visible: false, barSpacing: 4 },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      crosshair: { mode: 1 },
    });

    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true,
    });
    rsiSeries.setData(calculateRSI(effectiveCandleData));
    rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    rsiSeries.createPriceLine({ price: 30, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && rsiChartRef.current) rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
    });
    rsiChart.timeScale().fitContent();

    return () => { rsiChart.remove(); };
  }, [indicators.rsi, effectiveCandleData, colors]);

  // === MACD chart ===
  useEffect(() => {
    if (!indicators.macd || !macdContainerRef.current) {
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null; macdSeriesRef.current = null;
        signalSeriesRef.current = null; macdHistSeriesRef.current = null;
      }
      return;
    }

    const macdChart = createChart(macdContainerRef.current, {
      layout: { background: { color: colors.background }, textColor: colors.text },
      grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
      width: macdContainerRef.current.clientWidth, height: MACD_HEIGHT,
      timeScale: { visible: false, barSpacing: 4 },
      rightPriceScale: { borderColor: colors.border, scaleMargins: { top: 0.1, bottom: 0.1 } },
      crosshair: { mode: 1 },
    });

    const macdHistSeries = macdChart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 2 }, priceLineVisible: false });
    const macdSeries = macdChart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    const signalSeries = macdChart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });

    const macdData = calculateMACD(effectiveCandleData, colors.candleUp, colors.candleDown);
    macdHistSeries.setData(macdData.histogram);
    macdSeries.setData(macdData.macd);
    signalSeries.setData(macdData.signal);

    macdChartRef.current = macdChart;
    macdSeriesRef.current = macdSeries;
    signalSeriesRef.current = signalSeries;
    macdHistSeriesRef.current = macdHistSeries;

    chartRef.current?.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && macdChartRef.current) macdChartRef.current.timeScale().setVisibleLogicalRange(range);
    });
    macdChart.timeScale().fitContent();

    return () => { macdChart.remove(); };
  }, [indicators.macd, effectiveCandleData, colors]);

  // === Theme change ===
  useEffect(() => {
    if (!chartRef.current || !volumeChartRef.current) return;
    const c = CHART_COLORS[theme];
    chartRef.current.applyOptions({
      layout: { background: { color: c.background }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
    });
    volumeChartRef.current.applyOptions({
      layout: { background: { color: c.background }, textColor: c.text },
      grid: { vertLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
    });
    candleSeriesRef.current?.applyOptions({
      upColor: c.candleUp, downColor: c.candleDown,
      borderDownColor: c.candleDown, borderUpColor: c.candleUp,
      wickDownColor: c.candleDown, wickUpColor: c.candleUp,
    });
    if (volumeSeriesRef.current && effectiveCandleData.length > 0) {
      volumeSeriesRef.current.setData(generateVolumeData(effectiveCandleData, c.volumeUp, c.volumeDown));
    }
  }, [theme]);

  // === Real-time update ===
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current || !volumeSeriesRef.current) return;
    if (effectiveCandleData.length === 0) return;

    if (binanceSymbol) {
      // Real data: update last candle close with oracle price
      const lastCandle = effectiveCandleData[effectiveCandleData.length - 1];
      if (!lastCandle || !currentPrice) return;
      candleSeriesRef.current.update({
        time: lastCandle.time,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, currentPrice),
        low: Math.min(lastCandle.low, currentPrice),
        close: currentPrice,
      });
    } else {
      // Simulated: random tick every 3s
      const updateTimer = window.setInterval(() => {
        if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
        const now = Date.now();
        const normalizedTime = Math.floor(now / intervalMs) * Math.floor(intervalMs / 1000) as Time;
        const volatility = 0.001;
        const basePrice = lastPrice?.value || currentPrice;
        const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;
        const newPrice = basePrice + priceChange;

        const cur = currentCandleRef.current;
        if (!cur || cur.time !== normalizedTime) {
          currentCandleRef.current = {
            time: normalizedTime as number, open: basePrice,
            high: Math.max(basePrice, newPrice), low: Math.min(basePrice, newPrice),
            close: newPrice, volume: 100 + Math.random() * 200,
          };
        } else {
          cur.high = Math.max(cur.high, newPrice);
          cur.low = Math.min(cur.low, newPrice);
          cur.close = newPrice;
          cur.volume += Math.random() * 10;
        }

        const candle = currentCandleRef.current!;
        candleSeriesRef.current!.update({ time: candle.time as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close });
        volumeSeriesRef.current!.update({
          time: candle.time as Time, value: candle.volume,
          color: candle.close >= candle.open ? colors.volumeUp : colors.volumeDown,
        });
      }, 3000);
      return () => clearInterval(updateTimer);
    }
  }, [interval, currentPrice, lastPrice, binanceSymbol, effectiveCandleData]);

  // Compute display OHLCV (crosshair or last candle)
  const displayOhlcv: OhlcvData | null = ohlcv || (effectiveCandleData.length > 0
    ? (() => {
        const last = effectiveCandleData[effectiveCandleData.length - 1];
        return { open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume };
      })()
    : null);

  return (
    <div className={`bg-theme-bg-secondary rounded-lg overflow-hidden flex flex-col h-full pb-1 ${className}`}>
      <ChartHeader
        pairLabel={`${currentPool.baseToken.symbol}/${currentPool.quoteToken.symbol}`}
        lastPrice={lastPrice}
        indicators={indicators}
        onToggleIndicator={handleToggleIndicator}
        interval={interval}
        onIntervalChange={setInterval}
      />
      <OhlcvOverlay
        data={displayOhlcv}
        baseSymbol={baseSymbol}
        interval={interval}
        isRealData={!!binanceSymbol}
        indicators={indicators}
      />

      {/* Candlestick Chart — fills remaining height */}
      <div ref={mainChartWrapperRef} className="flex-1 min-h-0">
        <div ref={chartContainerRef} className="w-full" />
      </div>

      {/* RSI Chart */}
      {indicators.rsi && (
        <div className="shrink-0 border-t border-theme-border">
          <div className="px-3 py-1 text-xs xl:text-sm text-theme-text-muted bg-theme-bg-tertiary/30">RSI (14)</div>
          <div ref={rsiContainerRef} className="w-full" />
        </div>
      )}

      {/* MACD Chart */}
      {indicators.macd && (
        <div className="shrink-0 border-t border-theme-border">
          <div className="px-3 py-1 text-xs xl:text-sm text-theme-text-muted bg-theme-bg-tertiary/30">MACD (12, 26, 9)</div>
          <div ref={macdContainerRef} className="w-full" />
        </div>
      )}

      {/* Volume Chart */}
      <div ref={volumeContainerRef} className="w-full shrink-0 border-t border-theme-border" />
    </div>
  );
}
