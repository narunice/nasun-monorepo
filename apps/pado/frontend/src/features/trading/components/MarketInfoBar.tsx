/**
 * MarketInfoBar Component
 * Displays key market information in a single row above the chart
 * Benchmark: Lighter, Asterdex, Hyperliquid common pattern
 */

import { useMemo } from 'react';

interface MarketInfoBarProps {
  symbol: string;
  price: number;
  priceChange24h?: number;
  volume24h?: number;
  high24h?: number;
  low24h?: number;
  openInterest?: number;
  fundingRate?: number;
  nextFundingTime?: Date;
  className?: string;
}

export function MarketInfoBar({
  symbol,
  price,
  priceChange24h,
  volume24h,
  high24h,
  low24h,
  openInterest,
  fundingRate,
  nextFundingTime,
  className,
}: MarketInfoBarProps) {
  const hasChange = priceChange24h != null;
  const isPositiveChange = (priceChange24h ?? 0) >= 0;

  const formattedVolume = useMemo(() => {
    if (volume24h == null) return '--';
    if (volume24h >= 1_000_000) {
      return `$${(volume24h / 1_000_000).toFixed(2)}M`;
    } else if (volume24h >= 1_000) {
      return `$${(volume24h / 1_000).toFixed(2)}K`;
    }
    return `$${volume24h.toFixed(2)}`;
  }, [volume24h]);

  const formattedOI = useMemo(() => {
    if (!openInterest) return null;
    if (openInterest >= 1_000_000) {
      return `$${(openInterest / 1_000_000).toFixed(2)}M`;
    } else if (openInterest >= 1_000) {
      return `$${(openInterest / 1_000).toFixed(2)}K`;
    }
    return `$${openInterest.toFixed(2)}`;
  }, [openInterest]);

  const fundingCountdown = useMemo(() => {
    if (!nextFundingTime) return null;
    const now = new Date();
    const diff = nextFundingTime.getTime() - now.getTime();
    if (diff <= 0) return '00:00:00';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, [nextFundingTime]);

  return (
    <div className={`bg-theme-bg-secondary rounded-lg px-3 py-2 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {/* Symbol & Price */}
        <div className="flex items-center gap-2">
          <span className="text-trading-lg font-bold text-theme-text-primary">{symbol}</span>
          <span className={`text-trading-xl xl:text-trading-2xl font-bold ${isPositiveChange ? 'text-trading-bid' : 'text-trading-ask'}`}>
            ${price > 0 ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </span>
        </div>

        {/* 24h Change */}
        <div className="flex flex-col">
          <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">24h Change</span>
          <span className={`text-trading-sm xl:text-trading-lg font-medium ${hasChange ? (isPositiveChange ? 'text-trading-bid' : 'text-trading-ask') : 'text-theme-text-muted'}`}>
            {hasChange ? `${isPositiveChange ? '+' : ''}${priceChange24h.toFixed(2)}%` : '--'}
          </span>
        </div>

        {/* 24h High */}
        {high24h !== undefined && (
          <div className="flex flex-col">
            <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">24h High</span>
            <span className="text-trading-sm xl:text-trading-lg font-medium text-theme-text-secondary">
              ${high24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* 24h Low */}
        {low24h !== undefined && (
          <div className="flex flex-col">
            <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">24h Low</span>
            <span className="text-trading-sm xl:text-trading-lg font-medium text-theme-text-secondary">
              ${low24h.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* 24h Volume */}
        <div className="flex flex-col">
          <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">24h Volume</span>
          <span className="text-trading-sm xl:text-trading-lg font-medium text-theme-text-secondary">{formattedVolume}</span>
        </div>

        {/* Open Interest (Perp only) */}
        {formattedOI && (
          <div className="flex flex-col">
            <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Open Interest</span>
            <span className="text-trading-sm xl:text-trading-lg font-medium text-theme-text-secondary">{formattedOI}</span>
          </div>
        )}

        {/* Funding Rate (Perp only) */}
        {fundingRate !== undefined && (
          <div className="flex flex-col">
            <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">
              Funding {fundingCountdown && <span className="text-theme-text-muted">({fundingCountdown})</span>}
            </span>
            <span className={`text-trading-sm xl:text-trading-lg font-medium ${fundingRate >= 0 ? 'text-trading-bid' : 'text-trading-ask'}`}>
              {fundingRate >= 0 ? '+' : ''}{(fundingRate * 100).toFixed(4)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
