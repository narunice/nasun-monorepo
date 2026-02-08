/**
 * TradingViewChart - TradingView Advanced Charts integration
 *
 * Replaces lightweight-charts with TradingView widget for professional charting.
 * Uses PadoDatafeed adapter that fetches data from Binance API.
 *
 * Prerequisites:
 * - TradingView charting_library files in public/charting_library/
 * - License approved for non-commercial use
 *
 * Falls back to a loading/error state if the library is not available.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMarket } from '../../context/MarketContext';
import { useTheme } from '../../../../providers/theme';
import { PadoDatafeed } from '@/lib/tradingview';
import type { IChartingLibraryWidget } from '@/lib/tradingview';
import { getActiveTPSLOrders } from '../../lib/tpsl-storage';
import { TPSL_POLL_INTERVAL_MS } from '../../lib/tpsl-types';
import { getActivePriceAlerts } from '../../lib/price-alert-storage';
import { PRICE_ALERT_POLL_INTERVAL_MS } from '../../lib/price-alert-types';

// Map TV resolution strings to our TimeInterval labels for the saved state
const INTERVAL_TO_RESOLUTION: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': '1D',
  '1w': '1W',
};

interface TradingViewChartProps {
  currentPrice?: number;
  className?: string;
}

export function TradingViewChart({ currentPrice = 95000, className = '' }: TradingViewChartProps) {
  const { currentPool, getMarketLabel } = useMarket();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<IChartingLibraryWidget | null>(null);
  const datafeedRef = useRef<PadoDatafeed | null>(null);
  const currentPriceRef = useRef(currentPrice);
  const [libraryReady, setLibraryReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep currentPrice ref updated for datafeed callbacks
  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  // Load saved interval
  const getSavedResolution = useCallback((): string => {
    const stored = localStorage.getItem('pado:chart:interval');
    if (stored && INTERVAL_TO_RESOLUTION[stored]) {
      return INTERVAL_TO_RESOLUTION[stored];
    }
    return '15'; // Default 15m
  }, []);

  // Check if TradingView library is loaded
  useEffect(() => {
    const checkLibrary = () => {
      if (window.TradingView) {
        setLibraryReady(true);
        return true;
      }
      return false;
    };

    if (checkLibrary()) return;

    // Poll for library availability (it loads asynchronously from public/)
    const timer = setInterval(() => {
      if (checkLibrary()) {
        clearInterval(timer);
      }
    }, 500);

    // Give up after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(timer);
      if (!window.TradingView) {
        setError('TradingView library not found. Ensure charting_library is in public/.');
      }
    }, 10_000);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, []);

  // Initialize TradingView widget
  useEffect(() => {
    if (!libraryReady || !containerRef.current || !window.TradingView) return;

    // Clean up previous instance
    if (widgetRef.current) {
      widgetRef.current.remove();
      widgetRef.current = null;
    }
    if (datafeedRef.current) {
      datafeedRef.current.destroy();
      datafeedRef.current = null;
    }

    const datafeed = new PadoDatafeed(() => currentPriceRef.current);
    datafeedRef.current = datafeed;

    const widget = new window.TradingView.widget({
      container: containerRef.current,
      datafeed,
      library_path: '/charting_library/',
      locale: 'en',
      symbol: getMarketLabel(),
      interval: getSavedResolution(),
      theme: theme === 'dark' ? 'Dark' : 'Light',
      fullscreen: false,
      autosize: true,
      timezone: 'Etc/UTC',
      disabled_features: [
        'header_compare',         // No comparison (single market view)
        'header_symbol_search',   // Use Pado's MarketSelector instead
        'symbol_search_hot_key',
        'go_to_date',
      ],
      enabled_features: [
        'study_templates',
        'use_localstorage_for_settings',
        'save_chart_properties_to_local_storage',
      ],
      overrides: {
        'mainSeriesProperties.candleStyle.upColor': '#26a69a',
        'mainSeriesProperties.candleStyle.downColor': '#ef5350',
        'mainSeriesProperties.candleStyle.borderUpColor': '#26a69a',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef5350',
        'mainSeriesProperties.candleStyle.wickUpColor': '#26a69a',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef5350',
      },
    });

    widgetRef.current = widget;

    // Setup TP/SL and Price Alert lines after chart is ready
    widget.onChartReady(() => {
      renderPriceOverlays(widget);
    });

    return () => {
      if (widgetRef.current) {
        widgetRef.current.remove();
        widgetRef.current = null;
      }
      if (datafeedRef.current) {
        datafeedRef.current.destroy();
        datafeedRef.current = null;
      }
    };
  }, [libraryReady]); // Only recreate on library ready, not on every prop change

  // Market change -> switch TV symbol
  useEffect(() => {
    if (!widgetRef.current || !libraryReady) return;

    try {
      widgetRef.current.setSymbol(
        getMarketLabel(),
        getSavedResolution(),
      );
    } catch {
      // Widget might not be ready yet
    }
  }, [currentPool, libraryReady, getMarketLabel, getSavedResolution]);

  // Theme change -> update TV theme
  useEffect(() => {
    if (!widgetRef.current || !libraryReady) return;

    try {
      widgetRef.current.changeTheme(theme === 'dark' ? 'Dark' : 'Light');
    } catch {
      // Widget might not be ready yet
    }
  }, [theme, libraryReady]);

  // TP/SL + Price Alert overlay polling (unified to avoid removeAllShapes conflicts)
  useEffect(() => {
    if (!widgetRef.current || !libraryReady) return;

    const pollMs = Math.min(TPSL_POLL_INTERVAL_MS, PRICE_ALERT_POLL_INTERVAL_MS);
    const timer = setInterval(() => {
      if (widgetRef.current) {
        renderPriceOverlays(widgetRef.current);
      }
    }, pollMs);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Widget is expensive to recreate
  }, [libraryReady]);

  // Error state
  if (error) {
    return (
      <div className={`bg-theme-bg-secondary rounded-lg flex items-center justify-center h-full ${className}`}>
        <div className="text-center text-theme-text-muted">
          <p className="text-sm">Chart library unavailable</p>
          <p className="text-xs mt-1 opacity-60">{error}</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (!libraryReady) {
    return (
      <div className={`bg-theme-bg-secondary rounded-lg flex items-center justify-center h-full ${className}`}>
        <div className="text-center text-theme-text-muted">
          <div className="w-6 h-6 border-2 border-theme-border border-t-pd1 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading chart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-theme-bg-secondary rounded-lg overflow-hidden flex flex-col h-full ${className}`}>
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}

// ========================================
// TP/SL and Price Alert Rendering
// ========================================

/**
 * Render all price overlay shapes (TP/SL + alerts) in one pass.
 * Calls removeAllShapes() first to prevent accumulation.
 */
function renderPriceOverlays(widget: IChartingLibraryWidget): void {
  try {
    const chart = widget.activeChart();
    chart.removeAllShapes();

    // TP/SL lines
    const activeOrders = getActiveTPSLOrders();
    for (const order of activeOrders) {
      const isTP = order.triggerType === 'tp';
      chart.createShape(
        { price: order.triggerPrice },
        {
          shape: 'horizontal_line',
          overrides: {
            linecolor: isTP ? '#22c55e' : '#ef4444',
            linestyle: 2,
            linewidth: 1,
            showLabel: true,
            text: `${isTP ? 'TP' : 'SL'} ${order.side === 'buy' ? 'Buy' : 'Sell'} ${order.quantity}`,
          },
        },
      );
    }

    // Price alert lines
    const activeAlerts = getActivePriceAlerts();
    for (const alert of activeAlerts) {
      chart.createShape(
        { price: alert.targetPrice },
        {
          shape: 'horizontal_line',
          overrides: {
            linecolor: '#f97316',
            linestyle: 2,
            linewidth: 1,
            showLabel: true,
            text: `Alert ${alert.direction === 'above' ? '\u2191' : '\u2193'} $${alert.targetPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        },
      );
    }
  } catch {
    // Chart may not be ready
  }
}
