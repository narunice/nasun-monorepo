/**
 * Perpetual Market Info Component
 * Displays funding rate, OI, and other market stats
 */

import { usePerpMarketContext } from '../context/PerpMarketContext';

export function PerpMarketInfo() {
  const {
    selectedMarketDisplay,
    currentPrice,
    isPriceStale,
    isLoading,
  } = usePerpMarketContext();

  if (isLoading) {
    return (
      <div className="p-4 bg-theme-bg-secondary rounded-lg animate-pulse">
        <div className="h-6 bg-theme-bg-tertiary rounded w-1/3 mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 bg-theme-bg-tertiary rounded w-16" />
              <div className="h-5 bg-theme-bg-tertiary rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedMarketDisplay) {
    return (
      <div className="p-4 bg-theme-bg-secondary rounded-lg text-center text-theme-text-muted">
        No market selected
      </div>
    );
  }

  const {
    name,
    fundingRate,
    fundingRateValue,
    nextFundingTime,
    openInterestLongUsd,
    openInterestShortUsd,
    totalOpenInterestUsd,
    maxLeverage,
    takerFee,
  } = selectedMarketDisplay;

  const timeUntilFunding = nextFundingTime.getTime() - Date.now();
  const hoursUntilFunding = Math.max(0, Math.floor(timeUntilFunding / 3600000));
  const minutesUntilFunding = Math.max(
    0,
    Math.floor((timeUntilFunding % 3600000) / 60000),
  );

  return (
    <div className="p-4 bg-theme-bg-secondary rounded-lg">
      {/* Header with Price */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="text-sm text-theme-text-muted">Perpetual Futures</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">
            ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </p>
          {isPriceStale && (
            <span className="text-xs text-yellow-400">Price may be stale</span>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {/* Funding Rate */}
        <div>
          <p className="text-theme-text-muted text-xs mb-1">Funding Rate</p>
          <p
            className={`font-medium ${
              fundingRateValue >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {fundingRate}
          </p>
          <p className="text-xs text-theme-text-disabled">
            in {hoursUntilFunding}h {minutesUntilFunding}m
          </p>
        </div>

        {/* Open Interest */}
        <div>
          <p className="text-theme-text-muted text-xs mb-1">Open Interest</p>
          <p className="font-medium">
            ${formatNumber(totalOpenInterestUsd)}
          </p>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-green-400">
              L: ${formatNumber(openInterestLongUsd)}
            </span>
            <span className="text-theme-text-disabled">/</span>
            <span className="text-red-400">
              S: ${formatNumber(openInterestShortUsd)}
            </span>
          </div>
        </div>

        {/* Max Leverage */}
        <div>
          <p className="text-theme-text-muted text-xs mb-1">Max Leverage</p>
          <p className="font-medium">{maxLeverage}x</p>
        </div>

        {/* Trading Fee */}
        <div>
          <p className="text-theme-text-muted text-xs mb-1">Trading Fee</p>
          <p className="font-medium">{takerFee.toFixed(2)}%</p>
        </div>
      </div>

      {/* Long/Short Ratio Bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-theme-text-muted mb-1">
          <span>Long</span>
          <span>Short</span>
        </div>
        <div className="h-2 bg-red-500/30 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500"
            style={{
              width: `${totalOpenInterestUsd > 0 ? (openInterestLongUsd / totalOpenInterestUsd) * 100 : 50}%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-green-400">
            {totalOpenInterestUsd > 0
              ? ((openInterestLongUsd / totalOpenInterestUsd) * 100).toFixed(1)
              : '50.0'}
            %
          </span>
          <span className="text-red-400">
            {totalOpenInterestUsd > 0
              ? ((openInterestShortUsd / totalOpenInterestUsd) * 100).toFixed(1)
              : '50.0'}
            %
          </span>
        </div>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2) + 'K';
  }
  return num.toFixed(2);
}
