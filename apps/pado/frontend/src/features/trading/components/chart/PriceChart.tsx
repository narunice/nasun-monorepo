/**
 * PriceChart - Chart component with feature-flag switch
 *
 * When VITE_USE_TRADINGVIEW=true, renders TradingView Advanced Charts.
 * Otherwise, renders the built-in lightweight-charts implementation.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, ISeriesPrimitive, IPriceLine, Time, MouseEventParams } from 'lightweight-charts';
import { NETWORK_CONFIG } from '@/config/network';
import {
  calculateRSI,
  calculateMACD,
  calculateStochastic,
  calculateATR,
  generateVolumeData,
} from '@/lib/indicators';
import { getActiveTPSLOrders } from '../../lib/tpsl-storage';
import { TPSL_POLL_INTERVAL_MS } from '../../lib/tpsl-types';
import { PRICE_ALERT_POLL_INTERVAL_MS } from '../../lib/price-alert-types';
import { getActivePriceAlerts } from '../../lib/price-alert-storage';
import { usePriceAlertMonitor } from '../../hooks/usePriceAlertMonitor';
import { useMarket } from '../../context/MarketContext';
import { useTheme } from '../../../../providers/theme';
import { useChartData } from './hooks/useChartData';
import { useOverlayIndicators } from './hooks/useOverlayIndicators';
import { useSubChart } from './hooks/useSubChart';
import { ChartHeader } from './ChartHeader';
import { OhlcvOverlay } from './OhlcvOverlay';
import { DrawingToolbar } from './DrawingToolbar';
import { TradingViewChart } from './TradingViewChart';
import type { TimeInterval, IndicatorState, IndicatorId, OhlcvData } from './types';
import { CHART_COLORS, CHART_HEIGHT, VOLUME_HEIGHT, RSI_HEIGHT, MACD_HEIGHT, STOCH_HEIGHT, ATR_HEIGHT, DEFAULT_INDICATORS } from './types';
import type { ActiveTool, DrawingData, DrawingPoint } from './drawings/types';
import { CLICKS_REQUIRED, DEFAULT_STYLES } from './drawings/types';
import { loadDrawings, addDrawing, clearDrawings } from './drawings/drawing-storage';
import { HorizontalLinePrimitive } from './drawings/HorizontalLineRenderer';
import { TrendLinePrimitive } from './drawings/TrendLineRenderer';
import { FibonacciPrimitive } from './drawings/FibonacciRenderer';
import { PriceAlertPopover } from '../PriceAlertPopover';
import { NotificationSettings } from '../NotificationSettings';
import { ChartContextMenu, isTouchDevice } from './ChartContextMenu';
import { useOrderForm } from '../../context/OrderFormContext';

// Re-export TimeInterval for backward compatibility
export type { TimeInterval } from './types';

interface PriceChartProps {
  currentPrice?: number;
  className?: string;
}

export function PriceChart(props: PriceChartProps) {
  if (NETWORK_CONFIG.useTradingView) {
    return <TradingViewChart {...props} />;
  }
  return <LightweightChart {...props} />;
}

// ========================================
// Lightweight Charts Implementation (original)
// ========================================

const INDICATOR_IDS: IndicatorId[] = ['sma', 'ema', 'bb', 'vwap', 'ichimoku', 'rsi', 'macd', 'stoch', 'atr'];

function loadIndicators(): IndicatorState {
  try {
    const stored = localStorage.getItem('pado:chart:indicators');
    if (!stored) return { ...DEFAULT_INDICATORS };
    const parsed = JSON.parse(stored);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ...DEFAULT_INDICATORS };
    }

    // Migration: old format { ma: boolean, rsi: boolean, macd: boolean }
    if (Object.hasOwn(parsed, 'ma') && !Object.hasOwn(parsed, 'sma')) {
      const migrated: IndicatorState = {
        ...DEFAULT_INDICATORS,
        sma: { ...DEFAULT_INDICATORS.sma, enabled: parsed.ma === true },
        rsi: { ...DEFAULT_INDICATORS.rsi, enabled: parsed.rsi === true },
        macd: { ...DEFAULT_INDICATORS.macd, enabled: parsed.macd === true },
      };
      localStorage.setItem('pado:chart:indicators', JSON.stringify(migrated));
      return migrated;
    }

    // New format: validate each indicator
    const result = { ...DEFAULT_INDICATORS };
    for (const id of INDICATOR_IDS) {
      if (id in parsed && typeof parsed[id] === 'object' && parsed[id] !== null) {
        const cfg = parsed[id];
        if (typeof cfg.enabled === 'boolean') {
          result[id] = { ...DEFAULT_INDICATORS[id], enabled: cfg.enabled };
        }
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_INDICATORS };
  }
}

function LightweightChart({ currentPrice = 95000, className = '' }: PriceChartProps) {
  const { currentPool } = useMarket();
  const { theme } = useTheme();
  const baseSymbol = currentPool.baseToken.symbol;
  const colors = CHART_COLORS[theme];

  // State (persisted to localStorage)
  const [interval, setInterval] = useState<TimeInterval>(() => {
    const stored = localStorage.getItem('pado:chart:interval');
    return (stored && ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'].includes(stored)) ? stored as TimeInterval : '15m';
  });
  const [indicators, setIndicators] = useState<IndicatorState>(loadIndicators);
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
  const stochContainerRef = useRef<HTMLDivElement>(null);
  const atrContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const currentCandleRef = useRef<{ time: number; open: number; high: number; low: number; close: number; volume: number } | null>(null);

  // Drawing tool state
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [drawings, setDrawings] = useState<DrawingData[]>([]);
  const pendingPointsRef = useRef<DrawingPoint[]>([]);
  const drawingPrimitivesRef = useRef<ISeriesPrimitive<Time>[]>([]);
  const poolId = currentPool.id ?? 'default';

  // Price alert monitor
  const priceAlertMonitor = usePriceAlertMonitor();

  // Chart-to-Order context menu state
  const orderForm = useOrderForm();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; price: number } | null>(null);

  // Mobile long-press for chart-to-order (700ms threshold)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const LONG_PRESS_MS = 700;
    const MOVE_THRESHOLD = 10;

    const clearLongPress = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStartRef.current = null;
      // Restore default touch behavior
      container.style.removeProperty('-webkit-touch-callout');
      container.style.removeProperty('touch-action');
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (activeTool) return;
      const touch = e.touches[0];
      if (!touch) return;

      touchStartRef.current = { x: touch.clientX, y: touch.clientY };

      // Suppress iOS system menu during long-press detection
      container.style.setProperty('-webkit-touch-callout', 'none');
      container.style.setProperty('touch-action', 'none');

      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        const series = candleSeriesRef.current;
        if (!series || !container) return;

        const rect = container.getBoundingClientRect();
        const chartRelativeY = touch.clientY - rect.top;
        const price = series.coordinateToPrice(chartRelativeY);
        if (price === null || price <= 0) return;

        // Visual feedback: vibrate on Android (no-op on iOS)
        try { navigator.vibrate?.(50); } catch { /* unsupported */ }

        // Position popup 80px above finger to avoid occlusion, flip if near top
        const popupY = touch.clientY - 80 > 40 ? touch.clientY - 80 : touch.clientY + 40;
        setContextMenu({ x: touch.clientX, y: popupY, price: price as number });
      }, LONG_PRESS_MS);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || !longPressTimerRef.current) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
        clearLongPress();
      }
    };

    const handleTouchEnd = () => { clearLongPress(); };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd);
    container.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      clearLongPress();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [activeTool]);

  // Load drawings when pool changes, close context menu
  useEffect(() => {
    setDrawings(loadDrawings(poolId));
    setContextMenu(null);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, [poolId]);

  // ESC key to deselect tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool(null);
        pendingPointsRef.current = [];
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Persist interval and indicators to localStorage
  useEffect(() => { localStorage.setItem('pado:chart:interval', interval); }, [interval]);
  useEffect(() => { localStorage.setItem('pado:chart:indicators', JSON.stringify(indicators)); }, [indicators]);

  const handleToggleIndicator = useCallback((id: IndicatorId) => {
    setIndicators((prev) => ({
      ...prev,
      [id]: { ...prev[id], enabled: !prev[id].enabled },
    }));
  }, []);

  // === Initialize main chart + volume chart ===
  useEffect(() => {
    if (!chartContainerRef.current || !volumeContainerRef.current || !mainChartWrapperRef.current) return;

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

    const volumeSeries = volumeChart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'right',
    });

    chartRef.current = chart;
    volumeChartRef.current = volumeChart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Crosshair -> OHLCV overlay
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

    // Resize
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

    const resizeObserver = new ResizeObserver(handleResize);
    if (mainChartWrapperRef.current) resizeObserver.observe(mainChartWrapperRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.remove();
      volumeChart.remove();
      chartRef.current = null;
      volumeChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // === Update candle + volume data ===
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || effectiveCandleData.length === 0) return;

    candleSeriesRef.current.setData(effectiveCandleData);
    volumeSeriesRef.current.setData(generateVolumeData(effectiveCandleData, colors.volumeUp, colors.volumeDown));

    if (effectiveCandleData.length > 1) {
      const last = effectiveCandleData[effectiveCandleData.length - 1];
      const prev = effectiveCandleData[effectiveCandleData.length - 2];
      setLastPrice({ value: last.close, change: ((last.close - prev.close) / prev.close) * 100 });
    }

    chartRef.current?.timeScale().fitContent();
    volumeChartRef.current?.timeScale().fitContent();
  }, [effectiveCandleData]);

  // === Overlay indicators (SMA, EMA, BB) ===
  useOverlayIndicators({
    chartRef,
    indicators,
    candleData: effectiveCandleData,
    intervalMs,
  });

  // === RSI sub-chart ===
  useSubChart({
    containerRef: rsiContainerRef,
    enabled: indicators.rsi.enabled,
    mainChartRef: chartRef,
    colors,
    height: RSI_HEIGHT,
    setup: (chart) => {
      const series = chart.addSeries(LineSeries, {
        color: '#a855f7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true,
      });
      series.setData(calculateRSI(effectiveCandleData));
      series.createPriceLine({ price: 70, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      series.createPriceLine({ price: 30, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    },
    deps: [effectiveCandleData],
  });

  // === MACD sub-chart ===
  useSubChart({
    containerRef: macdContainerRef,
    enabled: indicators.macd.enabled,
    mainChartRef: chartRef,
    colors,
    height: MACD_HEIGHT,
    setup: (chart) => {
      const histSeries = chart.addSeries(HistogramSeries, { priceFormat: { type: 'price', precision: 2 }, priceLineVisible: false });
      const macdSeries = chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      const signalSeries = chart.addSeries(LineSeries, { color: '#fb923c', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      const macdData = calculateMACD(effectiveCandleData, colors.candleUp, colors.candleDown);
      histSeries.setData(macdData.histogram);
      macdSeries.setData(macdData.macd);
      signalSeries.setData(macdData.signal);
    },
    deps: [effectiveCandleData],
  });

  // === Stochastic sub-chart ===
  useSubChart({
    containerRef: stochContainerRef,
    enabled: indicators.stoch.enabled,
    mainChartRef: chartRef,
    colors,
    height: STOCH_HEIGHT,
    setup: (chart) => {
      const kSeries = chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      const dSeries = chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      const stochData = calculateStochastic(effectiveCandleData);
      kSeries.setData(stochData.k);
      dSeries.setData(stochData.d);
      kSeries.createPriceLine({ price: 80, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      kSeries.createPriceLine({ price: 20, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    },
    deps: [effectiveCandleData],
  });

  // === ATR sub-chart ===
  useSubChart({
    containerRef: atrContainerRef,
    enabled: indicators.atr.enabled,
    mainChartRef: chartRef,
    colors,
    height: ATR_HEIGHT,
    setup: (chart) => {
      const atrSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      atrSeries.setData(calculateATR(effectiveCandleData));
    },
    deps: [effectiveCandleData],
  });

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

  // === TP/SL Price Lines ===
  const tpslLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const series = candleSeriesRef.current;
    const updateLines = () => {
      if (!series) return;

      for (const line of tpslLinesRef.current) {
        try { series.removePriceLine(line); } catch { /* already removed */ }
      }
      tpslLinesRef.current = [];

      const activeOrders = getActiveTPSLOrders();
      for (const order of activeOrders) {
        const isTP = order.triggerType === 'tp';
        const line = series.createPriceLine({
          price: order.triggerPrice,
          color: isTP ? '#22c55e' : '#ef4444',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${isTP ? 'TP' : 'SL'} ${order.side === 'buy' ? 'Buy' : 'Sell'} ${order.quantity}`,
        });
        if (line) tpslLinesRef.current.push(line);
      }
    };

    updateLines();
    const timer = window.setInterval(updateLines, TPSL_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [effectiveCandleData]);

  // === Price Alert Lines ===
  const alertLinesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;

    const series = candleSeriesRef.current;
    const updateAlertLines = () => {
      if (!series) return;

      for (const line of alertLinesRef.current) {
        try { series.removePriceLine(line); } catch { /* already removed */ }
      }
      alertLinesRef.current = [];

      const activeAlerts = getActivePriceAlerts();
      for (const alert of activeAlerts) {
        const line = series.createPriceLine({
          price: alert.targetPrice,
          color: '#f97316',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `Alert ${alert.direction === 'above' ? '\u2191' : '\u2193'} $${alert.targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        });
        if (line) alertLinesRef.current.push(line);
      }
    };

    updateAlertLines();
    const timer = window.setInterval(updateAlertLines, PRICE_ALERT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [effectiveCandleData]);

  // === Drawing primitives rendering ===
  useEffect(() => {
    if (!candleSeriesRef.current) return;

    for (const prim of drawingPrimitivesRef.current) {
      try { candleSeriesRef.current?.detachPrimitive(prim); } catch { /* already detached */ }
    }
    drawingPrimitivesRef.current = [];

    for (const drawing of drawings) {
      let primitive: ISeriesPrimitive<Time> | null = null;

      switch (drawing.type) {
        case 'horizontal-line': {
          const p = drawing.points[0];
          if (p) {
            primitive = new HorizontalLinePrimitive(p.price, drawing.style, drawing.label);
          }
          break;
        }
        case 'trend-line': {
          if (drawing.points.length >= 2) {
            primitive = new TrendLinePrimitive(drawing.points, drawing.style);
          }
          break;
        }
        case 'fibonacci': {
          if (drawing.points.length >= 2) {
            primitive = new FibonacciPrimitive(drawing.points, drawing.style);
          }
          break;
        }
      }

      if (primitive) {
        candleSeriesRef.current?.attachPrimitive(primitive);
        drawingPrimitivesRef.current.push(primitive);
      }
    }
  }, [drawings, effectiveCandleData]);

  // === Chart click handler for drawing tools ===
  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const handleClick = (param: MouseEventParams) => {
      if (!activeTool || !param.time || !param.point) return;

      const series = candleSeriesRef.current;
      if (!series) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      const point: DrawingPoint = {
        time: param.time as number,
        price: price as number,
      };

      const required = CLICKS_REQUIRED[activeTool];
      pendingPointsRef.current.push(point);

      if (pendingPointsRef.current.length >= required) {
        const drawingData: DrawingData = {
          id: crypto.randomUUID(),
          type: activeTool,
          points: [...pendingPointsRef.current],
          style: { ...DEFAULT_STYLES[activeTool] },
        };

        addDrawing(poolId, drawingData);
        setDrawings(loadDrawings(poolId));
        pendingPointsRef.current = [];
      }
    };

    const chart = chartRef.current;
    chart.subscribeClick(handleClick);
    return () => {
      chart.unsubscribeClick(handleClick);
    };
  }, [activeTool, poolId]);

  const handleDeleteAllDrawings = useCallback(() => {
    clearDrawings(poolId);
    setDrawings([]);
  }, [poolId]);

  // === Real-time update ===
  useEffect(() => {
    if (!candleSeriesRef.current || !chartRef.current || !volumeSeriesRef.current) return;
    if (effectiveCandleData.length === 0) return;

    if (binanceSymbol) {
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
        priceAlertSlot={
          <PriceAlertPopover
            alerts={priceAlertMonitor.alerts}
            activeAlerts={priceAlertMonitor.activeAlerts}
            currentPrice={currentPrice}
            symbol={baseSymbol}
            onAddAlert={priceAlertMonitor.addAlert}
            onCancelAlert={priceAlertMonitor.cancelAlert}
            onRemoveAlert={priceAlertMonitor.removeAlert}
            onClearHistory={priceAlertMonitor.clearHistory}
          />
        }
        notificationSlot={<NotificationSettings />}
      />
      <OhlcvOverlay
        data={displayOhlcv}
        baseSymbol={baseSymbol}
        interval={interval}
        isRealData={!!binanceSymbol}
        indicators={indicators}
      />

      {/* Candlestick Chart */}
      <div ref={mainChartWrapperRef} className="flex-1 min-h-0 flex">
        <DrawingToolbar
          activeTool={activeTool}
          onToolSelect={setActiveTool}
          onDeleteAll={handleDeleteAllDrawings}
          drawingCount={drawings.length}
        />
        <div
          ref={chartContainerRef}
          className={`flex-1 ${activeTool ? 'cursor-crosshair' : ''}`}
          onContextMenu={(e) => {
            // Disable on touch devices to avoid conflict with pan/zoom
            if (isTouchDevice() || activeTool) return;
            e.preventDefault();
            const series = candleSeriesRef.current;
            if (!series || !chartContainerRef.current) return;
            const rect = chartContainerRef.current.getBoundingClientRect();
            const chartRelativeY = e.clientY - rect.top;
            const price = series.coordinateToPrice(chartRelativeY);
            if (price === null || price <= 0) return;
            setContextMenu({ x: e.clientX, y: e.clientY, price: price as number });
          }}
        />
      </div>

      {/* RSI Chart */}
      {indicators.rsi.enabled && (
        <div className="shrink-0 border-t border-theme-border">
          <div className="px-3 py-1 text-xs xl:text-sm text-theme-text-muted bg-theme-bg-tertiary/30">RSI (14)</div>
          <div ref={rsiContainerRef} className="w-full" />
        </div>
      )}

      {/* MACD Chart */}
      {indicators.macd.enabled && (
        <div className="shrink-0 border-t border-theme-border">
          <div className="px-3 py-1 text-xs xl:text-sm text-theme-text-muted bg-theme-bg-tertiary/30">MACD (12, 26, 9)</div>
          <div ref={macdContainerRef} className="w-full" />
        </div>
      )}

      {/* Stochastic Chart */}
      {indicators.stoch.enabled && (
        <div className="shrink-0 border-t border-theme-border">
          <div className="px-3 py-1 text-xs xl:text-sm text-theme-text-muted bg-theme-bg-tertiary/30">Stoch (14, 3, 3)</div>
          <div ref={stochContainerRef} className="w-full" />
        </div>
      )}

      {/* ATR Chart */}
      {indicators.atr.enabled && (
        <div className="shrink-0 border-t border-theme-border">
          <div className="px-3 py-1 text-xs xl:text-sm text-theme-text-muted bg-theme-bg-tertiary/30">ATR (14)</div>
          <div ref={atrContainerRef} className="w-full" />
        </div>
      )}

      {/* Volume Chart */}
      <div ref={volumeContainerRef} className="w-full shrink-0 border-t border-theme-border" />

      {/* Chart-to-Order Context Menu */}
      {contextMenu && (
        <ChartContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          price={contextMenu.price}
          onBuyLimit={(price) => {
            orderForm.setPrice(price.toFixed(2));
            orderForm.setSide('buy');
            orderForm.setOrderMode('limit');
          }}
          onSellLimit={(price) => {
            orderForm.setPrice(price.toFixed(2));
            orderForm.setSide('sell');
            orderForm.setOrderMode('limit');
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
