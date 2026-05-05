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

  /**
   * Generates a deterministic pseudo-realistic SVG path based on the symbol and 24h change.
   * Ensures each asset has a unique, stable identity.
   */
  const generateMiniGraphPath = (symbol: string, change: number) => {
    const points = 6; // More points for smoother but distinct look
    const width = 40;
    const height = 20;
    const padding = 3;
    
    // Simple hash function to get a deterministic seed from the symbol
    const getSeed = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    };

    const seed = getSeed(symbol);
    
    // Deterministic pseudo-random number generator
    const pseudoRandom = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

    // Start at center for maximum room to move
    let startY = height / 2;
    const path = [`M 0 ${startY.toFixed(1)}`];
    
    // Amplify the change for better visualization (more weight to the trend)
    // 3% change will move the line significantly
    const changeEffect = change * 2.0; 
    const targetY = startY - changeEffect;
    const clampedTargetY = Math.max(padding, Math.min(height - padding, targetY));
    
    for (let i = 1; i < points; i++) {
      const x = (width / (points - 1)) * i;
      const progress = i / (points - 1);
      
      // Trend towards target
      const trendY = startY + (clampedTargetY - startY) * progress;
      
      // Restore volatility for a more dynamic "real-chart" feel
      const volatility = (pseudoRandom(i) - 0.5) * (height / 2.5);
      
      let y = trendY + volatility;
      if (i === points - 1) y = clampedTargetY;
      
      y = Math.max(padding, Math.min(height - padding, y));
      path.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    
    return path.join(' ');
  };

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 h-full flex flex-col">
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
      <p className="text-xs xl:text-sm text-theme-text-muted mb-3">
        Live 24h market data
      </p>

      <div className="flex-1 flex flex-col justify-around">
        {isLoading ? (
          <>
            <SkeletonMarketRow />
            <SkeletonMarketRow />
            <SkeletonMarketRow />
          </>
        ) : (
          markets.map((market) => (
            <div
              key={market.symbol}
              onClick={
                spotEnabled
                  ? () => navigate(`/spot?market=${market.pool}`)
                  : undefined
              }
              className={`group flex items-center justify-between p-2 -mx-2 rounded-lg transition-colors ${
                spotEnabled
                  ? "cursor-pointer hover:bg-theme-bg-tertiary/50"
                  : "cursor-not-allowed opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <TokenIcon symbol={market.symbol} size="md" />
                <div>
                  <div className="font-medium text-theme-text-primary text-sm xl:text-base">
                    {market.symbol}
                  </div>
                  <div className="text-xs xl:text-sm text-theme-text-muted">
                    {market.name}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* 24h Mini Graph */}
                <div className="hidden sm:flex items-center h-8 w-16">
                  {market.change24h !== null && (
                    <svg
                      viewBox="0 0 40 20"
                      className={`w-full h-full ${
                        market.change24h >= 0
                          ? "text-green-500"
                          : "text-red-500"
                      }`}
                    >
                      <path
                        d={generateMiniGraphPath(market.symbol, market.change24h)}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>

                <div className="text-right">
                  <div className="font-medium text-theme-text-primary text-sm xl:text-base">
                    {formatPrice(market.price)}
                  </div>
                  <div
                    className={`text-xs xl:text-sm font-medium flex items-center justify-end gap-1 ${
                      market.change24h == null
                        ? "text-theme-text-muted"
                        : market.change24h >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {formatPercent(market.change24h)}
                    <span className="text-[10px] text-theme-text-muted font-normal">
                      24h
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
