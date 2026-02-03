/**
 * HotMarketsCard
 * Shows trending trading pairs with price changes
 */

import { Link } from 'react-router-dom';

// Simulated market data (will be replaced with real data)
interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  pool: string;
}

const HOT_MARKETS: MarketData[] = [
  { symbol: 'NBTC', name: 'Nasun BTC', price: 45000, change24h: 5.2, pool: 'NBTC_NUSDC' },
  { symbol: 'NASUN', name: 'Nasun', price: 1.25, change24h: -1.3, pool: 'NASUN_NUSDC' },
  { symbol: 'NUSDC', name: 'Nasun USDC', price: 1.0, change24h: 0.0, pool: 'NASUN_NUSDC' },
];

export function HotMarketsCard() {
  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return `$${price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    return `$${price.toFixed(2)}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-theme-text-primary">Hot Markets</h2>
        <Link to="/trade" className="text-xs text-pd3 hover:text-pd4">
          View All →
        </Link>
      </div>
      <p className="text-xs text-theme-text-muted mb-3">Trending tokens on Pado</p>

      <div className="space-y-3">
        {HOT_MARKETS.map((market) => (
          <Link
            key={market.symbol}
            to={`/trade?pool=${market.pool}`}
            className="flex items-center justify-between p-2 -mx-2 rounded-lg hover:bg-theme-bg-tertiary transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-theme-bg-tertiary rounded-full flex items-center justify-center text-xs font-bold text-theme-text-primary">
                {market.symbol.charAt(0)}
              </div>
              <div>
                <div className="font-medium text-theme-text-primary text-sm">{market.symbol}</div>
                <div className="text-xs text-theme-text-muted">{market.name}</div>
              </div>
            </div>

            <div className="text-right">
              <div className="font-medium text-theme-text-primary text-sm">
                {formatPrice(market.price)}
              </div>
              <div className={`text-xs ${market.change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatPercent(market.change24h)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
