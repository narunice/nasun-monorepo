/**
 * HotMarketsCard
 * Shows trending trading pairs with live price data from Binance
 */

import { Link } from 'react-router-dom';
import { useMarketOverview } from '../hooks';
import { SkeletonMarketRow, TokenIcon } from '@/components/common';

export function HotMarketsCard() {
  const { markets, isLoading } = useMarketOverview();

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
        <Link to="/trade" className="text-xs xl:text-sm text-pd3 hover:text-pd4">
          View All →
        </Link>
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
          <Link
            key={market.symbol}
            to={`/trade?pool=${market.pool}`}
            className="flex items-center justify-between p-2 -mx-2 rounded-lg hover:bg-theme-bg-tertiary transition-colors"
          >
            <div className="flex items-center gap-3">
              <TokenIcon symbol={market.symbol} size="md" />
              <div>
                <div className="font-medium text-theme-text-primary text-sm xl:text-base">{market.symbol}</div>
                <div className="text-xs xl:text-sm text-theme-text-muted">{market.name}</div>
              </div>
            </div>

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
          </Link>
        ))}
      </div>
    </div>
  );
}
