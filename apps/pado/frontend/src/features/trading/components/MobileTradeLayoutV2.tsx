/**
 * MobileTradeLayoutV2
 * Scrollable single-page mobile trading layout (replaces tab-based V1).
 * All sections visible in a single scroll: Chart → Orderbook → OrderForm.
 *
 * Benchmarked from Binance App and Bybit App patterns.
 * Key improvement: users can see chart AND place orders by scrolling,
 * eliminating context loss from tab switching.
 */

import { useRef, type ReactNode } from 'react';
import { MobileMarketHeader } from './MobileMarketHeader';
import { MiniOrderbook } from './MiniOrderbook';
import { MobileBottomBar } from './MobileBottomBar';
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
  onTradeClick?: (side: 'buy' | 'sell') => void;
  onExpandChart?: () => void;
  chartFullscreen?: boolean;
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
  onTradeClick,
  onExpandChart,
  chartFullscreen = false,
}: MobileTradeLayoutV2Props) {
  const orderFormRef = useRef<HTMLDivElement>(null);

  const handleTradeClick = (side: 'buy' | 'sell') => {
    onTradeClick?.(side);
    orderFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="lg:hidden">
      {/* Sticky Market Header — price always visible */}
      {miniTicker && (
        <MobileMarketHeader
          symbol={miniTicker.symbol}
          price={miniTicker.price}
          priceChange24h={miniTicker.priceChange24h}
          onExpandChart={onExpandChart}
        />
      )}

      {/* Scrollable content — pb-28 accounts for BottomBar + BottomNav */}
      <div className={`space-y-3 p-3 ${!isSimple ? 'pb-28' : ''}`}>
        {/* Chart — responsive height for mobile (40vh capped at 350px) */}
        <div
          style={{ height: 'min(40vh, 350px)' }}
          className={chartFullscreen ? 'invisible h-0 overflow-hidden' : ''}
        >
          {chartContent}
        </div>

        {/* Pro mode: Mini Orderbook (8 levels) */}
        {!isSimple && bids.length > 0 && (
          <MiniOrderbook
            bids={bids}
            asks={asks}
            midPrice={midPrice}
            onPriceClick={onPriceClick}
          />
        )}

        {/* Order Form (SwapForm for Simple, full OrderForm for Pro) */}
        <div ref={orderFormRef}>
          {tradeContent}
        </div>

        {/* Bottom Tab Panel (Pro mode: open orders, history) */}
        {bottomTabContent && (
          <div>{bottomTabContent}</div>
        )}
      </div>

      {/* Sticky Buy/Sell bar — Pro mode only */}
      {!isSimple && <MobileBottomBar onTradeClick={handleTradeClick} />}
    </div>
  );
}
