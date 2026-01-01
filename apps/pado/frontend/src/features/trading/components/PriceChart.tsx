import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useMarket } from '../context/MarketContext';
import { useTheme } from '../../../providers/theme';
import {
  calculateMA,
  calculateRSI,
  calculateMACD,
  generateCandleData,
  generateVolumeData,
} from '@/lib/indicators';

// Theme-aware chart colors
const CHART_COLORS = {
  dark: {
    background: '#1a1a2e',
    text: '#d1d4dc',
    grid: '#2B2B43',
    border: '#2B2B43',
  },
  light: {
    background: '#faf7f4',
    text: '#191615',
    grid: '#e5e2de',
    border: '#d4d1cd',
  },
};

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

interface PriceChartProps {
  currentPrice?: number;
  className?: string;
}

const INTERVAL_CONFIG: Record<TimeInterval, { label: string; ms: number; count: number }> = {
  '1m': { label: '1분', ms: 60 * 1000, count: 120 },
  '5m': { label: '5분', ms: 5 * 60 * 1000, count: 96 },
  '15m': { label: '15분', ms: 15 * 60 * 1000, count: 96 },
  '1h': { label: '1시간', ms: 60 * 60 * 1000, count: 72 },
  '4h': { label: '4시간', ms: 4 * 60 * 60 * 1000, count: 90 },
  '1d': { label: '1일', ms: 24 * 60 * 60 * 1000, count: 90 },
  '1w': { label: '1주', ms: 7 * 24 * 60 * 60 * 1000, count: 104 },
};

const CHART_HEIGHT = 280;
const VOLUME_HEIGHT = 80;
const RSI_HEIGHT = 80;
const MACD_HEIGHT = 100;

export function PriceChart({ currentPrice = 95000, className = '' }: PriceChartProps) {
  const { currentPool } = useMarket();
  const { theme } = useTheme();
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
  const [interval, setInterval] = useState<TimeInterval>('15m');
  const [indicators, setIndicators] = useState({ ma: true, rsi: false, macd: false });
  const [lastPrice, setLastPrice] = useState<{ value: number; change: number } | null>(null);
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);
  const colors = CHART_COLORS[theme];

  // Memoized candle data
  const candleData = useMemo(() => {
    const { count, ms } = INTERVAL_CONFIG[interval];
    return generateCandleData(currentPrice, count, ms);
  }, [interval, currentPrice]);

  // Initialize charts
  useEffect(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current) return;

    // Main chart (candlestick + MA)
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      width: chartContainerRef.current.clientWidth,
      height: CHART_HEIGHT,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 4,
      },
      rightPriceScale: {
        borderColor: colors.border,
      },
      crosshair: {
        mode: 1,
      },
      localization: {
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
    });

    // Volume chart
    const volumeChart = createChart(volumeContainerRef.current, {
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { visible: false },
      },
      width: volumeContainerRef.current.clientWidth,
      height: VOLUME_HEIGHT,
      timeScale: {
        visible: false,
        barSpacing: 4,
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
      },
      crosshair: {
        mode: 1,
      },
    });

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    // MA5 series (yellow)
    const ma5Series = chart.addSeries(LineSeries, {
      color: '#fbbf24',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // MA20 series (blue)
    const ma20Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    // Volume series
    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'right',
    });

    chartRef.current = chart;
    volumeChartRef.current = volumeChart;
    candleSeriesRef.current = candleSeries;
    ma5SeriesRef.current = ma5Series;
    ma20SeriesRef.current = ma20Series;
    volumeSeriesRef.current = volumeSeries;

    // Sync timescales
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        volumeChart.timeScale().setVisibleLogicalRange(range);
      }
    });

    volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) {
        chart.timeScale().setVisibleLogicalRange(range);
      }
    });

    // Resize handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
      if (volumeContainerRef.current && volumeChartRef.current) {
        volumeChartRef.current.applyOptions({
          width: volumeContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      volumeChart.remove();
    };
  }, []);

  // Update data when candleData changes (NOT when showMA changes)
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    // Set candle data
    candleSeriesRef.current.setData(candleData);

    // Set MA data (always set data, visibility controlled separately)
    if (ma5SeriesRef.current && ma20SeriesRef.current) {
      const ma5Data = calculateMA(candleData, 5);
      const ma20Data = calculateMA(candleData, 20);
      ma5SeriesRef.current.setData(ma5Data);
      ma20SeriesRef.current.setData(ma20Data);
    }

    // Set volume data
    const volumeData = generateVolumeData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Update last price
    if (candleData.length > 1) {
      const last = candleData[candleData.length - 1];
      const prev = candleData[candleData.length - 2];
      const change = ((last.close - prev.close) / prev.close) * 100;
      setLastPrice({ value: last.close, change });
    }

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
    if (volumeChartRef.current) {
      volumeChartRef.current.timeScale().fitContent();
    }
  }, [candleData]);

  // Toggle MA visibility (separate from data updates)
  useEffect(() => {
    if (!ma5SeriesRef.current || !ma20SeriesRef.current) return;

    ma5SeriesRef.current.applyOptions({ visible: indicators.ma });
    ma20SeriesRef.current.applyOptions({ visible: indicators.ma });
  }, [indicators.ma]);

  // RSI Chart initialization and updates
  useEffect(() => {
    if (!indicators.rsi || !rsiContainerRef.current) {
      // Clean up if RSI is disabled
      if (rsiChartRef.current) {
        rsiChartRef.current.remove();
        rsiChartRef.current = null;
        rsiSeriesRef.current = null;
      }
      return;
    }

    // Create RSI chart
    const rsiChart = createChart(rsiContainerRef.current, {
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      width: rsiContainerRef.current.clientWidth,
      height: RSI_HEIGHT,
      timeScale: {
        visible: false,
        barSpacing: 4,
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      crosshair: { mode: 1 },
    });

    // RSI series
    const rsiSeries = rsiChart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    // Set RSI data
    const rsiData = calculateRSI(candleData);
    rsiSeries.setData(rsiData);

    // Add overbought/oversold lines (70/30)
    rsiSeries.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    rsiSeries.createPriceLine({ price: 30, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiSeries;

    // Sync with main chart timescale
    if (chartRef.current) {
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && rsiChartRef.current) {
          rsiChartRef.current.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    rsiChart.timeScale().fitContent();

    return () => {
      rsiChart.remove();
    };
  }, [indicators.rsi, candleData, colors]);

  // MACD Chart initialization and updates
  useEffect(() => {
    if (!indicators.macd || !macdContainerRef.current) {
      // Clean up if MACD is disabled
      if (macdChartRef.current) {
        macdChartRef.current.remove();
        macdChartRef.current = null;
        macdSeriesRef.current = null;
        signalSeriesRef.current = null;
        macdHistSeriesRef.current = null;
      }
      return;
    }

    // Create MACD chart
    const macdChart = createChart(macdContainerRef.current, {
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      width: macdContainerRef.current.clientWidth,
      height: MACD_HEIGHT,
      timeScale: {
        visible: false,
        barSpacing: 4,
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      crosshair: { mode: 1 },
    });

    // MACD Histogram
    const macdHistSeries = macdChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'price', precision: 2 },
      priceLineVisible: false,
    });

    // MACD Line
    const macdSeries = macdChart.addSeries(LineSeries, {
      color: '#22d3ee',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Signal Line
    const signalSeries = macdChart.addSeries(LineSeries, {
      color: '#fb923c',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // Set MACD data
    const macdData = calculateMACD(candleData);
    macdHistSeries.setData(macdData.histogram);
    macdSeries.setData(macdData.macd);
    signalSeries.setData(macdData.signal);

    macdChartRef.current = macdChart;
    macdSeriesRef.current = macdSeries;
    signalSeriesRef.current = signalSeries;
    macdHistSeriesRef.current = macdHistSeries;

    // Sync with main chart timescale
    if (chartRef.current) {
      chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range && macdChartRef.current) {
          macdChartRef.current.timeScale().setVisibleLogicalRange(range);
        }
      });
    }

    macdChart.timeScale().fitContent();

    return () => {
      macdChart.remove();
    };
  }, [indicators.macd, candleData, colors]);

  // Update chart colors when theme changes
  useEffect(() => {
    if (!chartRef.current || !volumeChartRef.current) return;

    const chartColors = CHART_COLORS[theme];
    chartRef.current.applyOptions({
      layout: {
        background: { color: chartColors.background },
        textColor: chartColors.text,
      },
      grid: {
        vertLines: { color: chartColors.grid },
        horzLines: { color: chartColors.grid },
      },
      rightPriceScale: {
        borderColor: chartColors.border,
      },
    });

    volumeChartRef.current.applyOptions({
      layout: {
        background: { color: chartColors.background },
        textColor: chartColors.text,
      },
      grid: {
        vertLines: { color: chartColors.grid },
      },
      rightPriceScale: {
        borderColor: chartColors.border,
      },
    });
  }, [theme]);

  // Real-time simulation
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current || !volumeSeriesRef.current) return;

    const { ms: intervalMs } = INTERVAL_CONFIG[interval];

    const updateTimer = window.setInterval(() => {
      if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

      const now = Date.now();
      const normalizedTime = Math.floor(now / intervalMs) * Math.floor(intervalMs / 1000) as Time;

      const volatility = 0.001;
      const basePrice = lastPrice?.value || currentPrice;
      const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;
      const newPrice = basePrice + priceChange;

      const currentCandle = currentCandleRef.current;
      if (!currentCandle || currentCandle.time !== normalizedTime) {
        currentCandleRef.current = {
          time: normalizedTime as number,
          open: basePrice,
          high: Math.max(basePrice, newPrice),
          low: Math.min(basePrice, newPrice),
          close: newPrice,
          volume: 100 + Math.random() * 200,
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, newPrice);
        currentCandle.low = Math.min(currentCandle.low, newPrice);
        currentCandle.close = newPrice;
        currentCandle.volume += Math.random() * 10;
      }

      const candle = currentCandleRef.current!;
      candleSeriesRef.current.update({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });

      volumeSeriesRef.current.update({
        time: candle.time as Time,
        value: candle.volume,
        color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
      });
    }, 3000);

    return () => clearInterval(updateTimer);
  }, [interval, currentPrice, lastPrice]);

  return (
    <div className={`bg-theme-bg-secondary rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-theme-border">
        <div className="flex items-center gap-4">
          <span className="font-semibold">{currentPool.baseToken.symbol}/{currentPool.quoteToken.symbol}</span>
          {lastPrice && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg">
                ${lastPrice.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-sm ${lastPrice.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {lastPrice.change >= 0 ? '+' : ''}{lastPrice.change.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Indicator Toggles */}
          <div className="flex gap-1">
            <button
              onClick={() => setIndicators((prev) => ({ ...prev, ma: !prev.ma }))}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                indicators.ma
                  ? 'bg-yellow-600 text-white'
                  : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
              }`}
              title="Toggle Moving Averages"
            >
              MA
            </button>
            <button
              onClick={() => setIndicators((prev) => ({ ...prev, rsi: !prev.rsi }))}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                indicators.rsi
                  ? 'bg-purple-600 text-white'
                  : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
              }`}
              title="Toggle RSI (Relative Strength Index)"
            >
              RSI
            </button>
            <button
              onClick={() => setIndicators((prev) => ({ ...prev, macd: !prev.macd }))}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                indicators.macd
                  ? 'bg-cyan-600 text-white'
                  : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
              }`}
              title="Toggle MACD"
            >
              MACD
            </button>
          </div>

          {/* Interval Selector */}
          <div className="flex gap-1">
            {(Object.keys(INTERVAL_CONFIG) as TimeInterval[]).map((key) => (
              <button
                key={key}
                onClick={() => setInterval(key)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  interval === key
                    ? 'bg-blue-600 text-white'
                    : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator Legends */}
      {(indicators.ma || indicators.rsi || indicators.macd) && (
        <div className="flex items-center gap-4 px-3 py-1 text-xs border-b border-theme-border/50">
          {indicators.ma && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-yellow-400"></span>
                <span className="text-theme-text-muted">MA5</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-blue-400"></span>
                <span className="text-theme-text-muted">MA20</span>
              </span>
            </>
          )}
          {indicators.rsi && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-purple-400"></span>
              <span className="text-theme-text-muted">RSI(14)</span>
            </span>
          )}
          {indicators.macd && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-cyan-400"></span>
                <span className="text-theme-text-muted">MACD</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-0.5 bg-orange-400"></span>
                <span className="text-theme-text-muted">Signal</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* Candlestick Chart */}
      <div ref={chartContainerRef} className="w-full" />

      {/* RSI Chart */}
      {indicators.rsi && (
        <div className="border-t border-theme-border">
          <div className="px-3 py-1 text-xs text-theme-text-muted bg-theme-bg-tertiary/30">
            RSI (14)
          </div>
          <div ref={rsiContainerRef} className="w-full" />
        </div>
      )}

      {/* MACD Chart */}
      {indicators.macd && (
        <div className="border-t border-theme-border">
          <div className="px-3 py-1 text-xs text-theme-text-muted bg-theme-bg-tertiary/30">
            MACD (12, 26, 9)
          </div>
          <div ref={macdContainerRef} className="w-full" />
        </div>
      )}

      {/* Volume Chart */}
      <div ref={volumeContainerRef} className="w-full border-t border-theme-border" />
    </div>
  );
}
