import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, Time } from 'lightweight-charts';
import { useMarket } from '../context/MarketContext';

export type TimeInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';

interface PriceChartProps {
  currentPrice?: number;
  className?: string;
}

// 시뮬레이션 OHLC 데이터 생성 (실제로는 거래 이벤트에서 계산)
function generateCandleData(basePrice: number, count: number, intervalMs: number): CandlestickData[] {
  const data: CandlestickData[] = [];
  let price = basePrice;
  const now = Date.now();
  const startTime = now - count * intervalMs;

  for (let i = 0; i < count; i++) {
    const time = Math.floor((startTime + i * intervalMs) / 1000) as Time;
    const volatility = 0.02; // 2% 변동성

    const open = price;
    const change1 = (Math.random() - 0.5) * 2 * volatility * price;
    const change2 = (Math.random() - 0.5) * 2 * volatility * price;
    const change3 = (Math.random() - 0.5) * 2 * volatility * price;

    const high = Math.max(open, open + change1, open + change2, open + change3);
    const low = Math.min(open, open + change1, open + change2, open + change3);
    const close = open + change3;

    data.push({ time, open, high, low, close });
    price = close;
  }

  return data;
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

export function PriceChart({ currentPrice = 95000, className = '' }: PriceChartProps) {
  const { currentPool } = useMarket();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [interval, setInterval] = useState<TimeInterval>('15m');
  const [lastPrice, setLastPrice] = useState<{ value: number; change: number } | null>(null);
  // 현재 캔들 상태 추적 (실시간 업데이트용)
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  // 차트 초기화
  useEffect(() => {
    if (!chartContainerRef.current) return;

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
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 4, // Narrower candles for a sleeker look
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
      },
      crosshair: {
        mode: 1, // Normal
      },
      localization: {
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleString('ko-KR', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
        },
      },
    });

    // v5 API: addSeries with CandlestickSeries
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // 데이터 업데이트
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const { count, ms } = INTERVAL_CONFIG[interval];
    const data = generateCandleData(currentPrice, count, ms);
    candleSeriesRef.current.setData(data);

    // 마지막 가격 정보
    if (data.length > 1) {
      const last = data[data.length - 1];
      const prev = data[data.length - 2];
      const change = ((last.close - prev.close) / prev.close) * 100;
      setLastPrice({ value: last.close, change });
    }

    // 차트를 최신 데이터로 스크롤
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [interval, currentPrice]);

  // 실시간 업데이트 시뮬레이션
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current) return;

    const { ms: intervalMs } = INTERVAL_CONFIG[interval];

    const updateTimer = window.setInterval(() => {
      if (!candleSeriesRef.current) return;

      // interval에 맞게 시간 정규화 (예: 15분 간격이면 15분 단위로 내림)
      const now = Date.now();
      const normalizedTime = Math.floor(now / intervalMs) * Math.floor(intervalMs / 1000) as Time;

      const volatility = 0.001;
      const basePrice = lastPrice?.value || currentPrice;
      const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;
      const newPrice = basePrice + priceChange;

      // 현재 캔들이 없거나 새 구간이 시작되면 새 캔들 생성
      const currentCandle = currentCandleRef.current;
      if (!currentCandle || currentCandle.time !== normalizedTime) {
        currentCandleRef.current = {
          time: normalizedTime as number,
          open: basePrice,
          high: Math.max(basePrice, newPrice),
          low: Math.min(basePrice, newPrice),
          close: newPrice,
        };
      } else {
        // 같은 구간 내에서는 기존 캔들 업데이트
        currentCandle.high = Math.max(currentCandle.high, newPrice);
        currentCandle.low = Math.min(currentCandle.low, newPrice);
        currentCandle.close = newPrice;
      }

      // 차트에 업데이트
      const candle = currentCandleRef.current!;
      candleSeriesRef.current.update({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      });
    }, 3000); // 3초마다 업데이트

    return () => clearInterval(updateTimer);
  }, [interval, currentPrice, lastPrice]);

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden ${className}`}>
      {/* 헤더 */}
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

        {/* 시간 간격 선택 */}
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

      {/* 차트 */}
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
