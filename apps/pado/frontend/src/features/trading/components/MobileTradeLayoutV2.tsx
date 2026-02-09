/**
 * MobileTradeLayoutV2
 * Scrollable single-page mobile trading layout (replaces tab-based V1).
 * All sections visible in a single scroll: Chart → Orderbook → OrderForm.
 *
 * Benchmarked from Binance App and Bybit App patterns.
 * Key improvement: users can see chart AND place orders by scrolling,
 * eliminating context loss from tab switching.
 */

import type { ReactNode } from 'react';
import { MobileMarketHeader } from './MobileMarketHeader';
import { MiniOrderbook } from './MiniOrderbook';
import type { PriceLevel } from '../../../lib/deepbook';

interface MiniTickerData {
  symbol: string;
  price: number;
  priceChange24h?: number;
}

interface MobileTradeLayoutV2Props {
  chartContent: ReactNode;
  tradeContent: ReactNode;
  miniTicker?: MiniTickerData;
  // Pro mode orderbook data
  bids?: PriceLevel[];
  asks?: PriceLevel[];
  midPrice?: number;
  onPriceClick?: (price: number) => void;
  bottomTabContent?: ReactNode;
  isSimple?: boolean;
}

export function MobileTradeLayoutV2({
  chartContent,
  tradeContent,
  miniTicker,
  bids = [],
  asks = [],
  midPrice = 0,
  onPriceClick,
  bottomTabContent,
  isSimple = false,
}: MobileTradeLayoutV2Props) {
  return (
    <div className="lg:hidden">
      {/* Sticky Market Header — price always visible */}
      {miniTicker && (
        <MobileMarketHeader
          symbol={miniTicker.symbol}
          price={miniTicker.price}
          priceChange24h={miniTicker.priceChange24h}
        />
      )}

      {/* Scrollable content */}
      <div className="space-y-3 p-3">
        {/* Chart — compact height for mobile */}
        <div style={{ height: '250px' }}>
          {chartContent}
        </div>

        {/* Pro mode: Mini Orderbook (5 levels) */}
        {!isSimple && bids.length > 0 && (
          <MiniOrderbook
            bids={bids}
            asks={asks}
            midPrice={midPrice}
            onPriceClick={onPriceClick}
          />
        )}

        {/* Order Form (SwapForm for Simple, full OrderForm for Pro) */}
        <div>
          {tradeContent}
        </div>

        {/* Bottom Tab Panel (Pro mode: open orders, history) */}
        {bottomTabContent && (
          <div>{bottomTabContent}</div>
        )}
      </div>
    </div>
  );
}
