/**
 * HotMarketsCard
 * Shows trending trading pairs with live price data from Binance
 */

import { useNavigate } from 'react-router-dom';
import { useMarketOverview } from '../hooks';
import { SkeletonMarketRow, TokenIcon } from '@/components/common';
import { hasAccess } from '@/config/network';

export function HotMarketsCard() {
  const { markets, isLoading } = useMarketOverview();
  const navigate = useNavigate();
  const spotEnabled = hasAccess('spot');

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    return `$${price.toFixed(2)}`;
  };

  const formatPercent = (value: number | null) => {
    if (value == null) return '--';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-theme-text-primary">Hot Markets</h2>
        {spotEnabled ? (
          <button
            onClick={() => navigate('/spot')}
            className="text-xs xl:text-sm text-pd3 hover:text-pd3/80 transition-colors"
          >
            View All →
          </button>
        ) : (
          <span className="text-xs xl:text-sm text-theme-text-muted cursor-not-allowed">
            View All →
          </span>
        )}
      </div>
      <p className="text-xs xl:text-sm text-theme-text-muted mb-3">Live market data</p>

      <div className="space-y-3">
        {isLoading ? (
          <>
            <SkeletonMarketRow />
            <SkeletonMarketRow />
            <SkeletonMarketRow />
            <SkeletonMarketRow />
          </>
        ) : markets.map((market) => (
          <div
            key={market.symbol}
            onClick={spotEnabled ? () => navigate(`/spot?market=${market.pool}`) : undefined}
            className={`group flex items-center justify-between p-2 -mx-2 rounded-lg transition-colors ${
              spotEnabled
                ? 'cursor-pointer hover:bg-theme-bg-tertiary/50'
                : 'cursor-not-allowed opacity-60'
            }`}
          >
            <div className="flex items-center gap-3">
              <TokenIcon symbol={market.symbol} size="md" />
              <div>
                <div className="font-medium text-theme-text-primary text-sm xl:text-base">{market.symbol}</div>
                <div className="text-xs xl:text-sm text-theme-text-muted">{market.name}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {spotEnabled ? (
                <svg className="w-4 h-4 text-theme-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-theme-text-muted hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
              <div className="text-right">
                <div className="font-medium text-theme-text-primary text-sm xl:text-base">
                  {formatPrice(market.price)}
                </div>
                <div className={`text-xs xl:text-sm font-medium ${
                  market.change24h == null
                    ? 'text-theme-text-muted'
                    : market.change24h >= 0
                      ? 'text-green-500'
                      : 'text-red-500'
                }`}>
                  {formatPercent(market.change24h)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
