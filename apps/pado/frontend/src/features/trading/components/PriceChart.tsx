import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time, LineData, HistogramData } from 'lightweight-charts';
import { useMarket } from '../context/MarketContext';

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

interface PriceChartProps {
  currentPrice?: number;
  className?: string;
}

// Extended candle data with volume
interface CandleWithVolume extends CandlestickData {
  volume: number;
}

// Calculate Moving Average
function calculateMA(data: CandlestickData[], period: number): LineData[] {
  const result: LineData[] = [];

  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    result.push({
      time: data[i].time,
      value: sum / period,
    });
  }

  return result;
}

// Generate simulated OHLCV data
function generateCandleData(basePrice: number, count: number, intervalMs: number): CandleWithVolume[] {
  const data: CandleWithVolume[] = [];
  let price = basePrice;
  const now = Date.now();
  const startTime = now - count * intervalMs;

  for (let i = 0; i < count; i++) {
    const time = Math.floor((startTime + i * intervalMs) / 1000) as Time;
    const volatility = 0.02;

    const open = price;
    const change1 = (Math.random() - 0.5) * 2 * volatility * price;
    const change2 = (Math.random() - 0.5) * 2 * volatility * price;
    const change3 = (Math.random() - 0.5) * 2 * volatility * price;

    const high = Math.max(open, open + change1, open + change2, open + change3);
    const low = Math.min(open, open + change1, open + change2, open + change3);
    const close = open + change3;
    const volume = 100 + Math.random() * 900; // 100-1000

    data.push({ time, open, high, low, close, volume });
    price = close;
  }

  return data;
}

// Generate volume histogram data
function generateVolumeData(candleData: CandleWithVolume[]): HistogramData[] {
  return candleData.map((candle) => ({
    time: candle.time,
    value: candle.volume,
    color: candle.close >= candle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
  }));
}

const INTERVAL_CONFIG: Record<TimeInterval, { label: string; ms: number; count: number }> = {
  '1m': { label: '1분', ms: 60 * 1000, count: 60 },
  '5m': { label: '5분', ms: 5 * 60 * 1000, count: 48 },
  '15m': { label: '15분', ms: 15 * 60 * 1000, count: 32 },
  '1h': { label: '1시간', ms: 60 * 60 * 1000, count: 24 },
  '4h': { label: '4시간', ms: 4 * 60 * 60 * 1000, count: 42 },
  '1d': { label: '1일', ms: 24 * 60 * 60 * 1000, count: 30 },
  '1w': { label: '1주', ms: 7 * 24 * 60 * 60 * 1000, count: 52 },
};

const CHART_HEIGHT = 280;
const VOLUME_HEIGHT = 80;

export function PriceChart({ currentPrice = 95000, className = '' }: PriceChartProps) {
  const { currentPool } = useMarket();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const ma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [interval, setInterval] = useState<TimeInterval>('15m');
  const [showMA, setShowMA] = useState(true);
  const [lastPrice, setLastPrice] = useState<{ value: number; change: number } | null>(null);
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);

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
        background: { color: '#1a1a2e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      width: chartContainerRef.current.clientWidth,
      height: CHART_HEIGHT,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 4,
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
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
        background: { color: '#1a1a2e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { visible: false },
      },
      width: volumeContainerRef.current.clientWidth,
      height: VOLUME_HEIGHT,
      timeScale: {
        visible: false,
        barSpacing: 4,
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
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

  // Update data when interval or price changes
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    // Set candle data
    candleSeriesRef.current.setData(candleData);

    // Set MA data
    if (ma5SeriesRef.current && ma20SeriesRef.current) {
      const ma5Data = calculateMA(candleData, 5);
      const ma20Data = calculateMA(candleData, 20);
      ma5SeriesRef.current.setData(showMA ? ma5Data : []);
      ma20SeriesRef.current.setData(showMA ? ma20Data : []);
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
  }, [candleData, showMA]);

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
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
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
          {/* MA Toggle */}
          <button
            onClick={() => setShowMA(!showMA)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showMA
                ? 'bg-yellow-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="Toggle Moving Averages"
          >
            MA
          </button>

          {/* Interval Selector */}
          <div className="flex gap-1">
            {(Object.keys(INTERVAL_CONFIG) as TimeInterval[]).map((key) => (
              <button
                key={key}
                onClick={() => setInterval(key)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  interval === key
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MA Legend */}
      {showMA && (
        <div className="flex items-center gap-4 px-3 py-1 text-xs border-b border-gray-700/50">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-yellow-400"></span>
            <span className="text-gray-400">MA5</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-400"></span>
            <span className="text-gray-400">MA20</span>
          </span>
        </div>
      )}

      {/* Candlestick Chart */}
      <div ref={chartContainerRef} className="w-full" />

      {/* Volume Chart */}
      <div ref={volumeContainerRef} className="w-full border-t border-gray-700" />
    </div>
  );
}
