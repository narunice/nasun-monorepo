/**
 * MarketPanel Container
 * 차트 + 오더북 + 거래 이력 (lg:col-span-2)
 * Simple mode: Chart only
 * Pro mode: Chart + Orderbook + Trade History
 */

import { useMemo } from 'react';
import { useOrderbook, type TradeMode } from '../hooks';
import { useOrderForm, useMarket } from '../context';
import { PriceChart, Orderbook, TradeHistory, MarketInfoBar } from '../components';

interface MarketPanelProps {
  mode?: TradeMode;
}

export function MarketPanel({ mode = 'pro' }: MarketPanelProps) {
  const isSimple = mode === 'simple';
  const { currentPool } = useMarket();
  const { data: orderbookData } = useOrderbook();
  const { setPrice } = useOrderForm();

  const orderbook = orderbookData?.orderbook ?? { bids: [], asks: [], spread: 0, midPrice: 0 };
  const midPrice = orderbookData?.midPrice ?? 0;

  // Market info bar data (simulated for now, can be replaced with real data)
  const marketInfo = useMemo(() => {
    const basePrice = midPrice || 95000;
    return {
      symbol: `${currentPool.baseToken.symbol}/${currentPool.quoteToken.symbol}`,
      price: basePrice,
      priceChange24h: 2.34, // TODO: Replace with real 24h change
      volume24h: 1_250_000, // TODO: Replace with real 24h volume
      high24h: basePrice * 1.025,
      low24h: basePrice * 0.975,
    };
  }, [midPrice, currentPool]);

  // 오더북 가격 클릭 시 주문 폼에 입력
  const handlePriceClick = (price: number) => {
    setPrice(price.toFixed(2));
  };

  return (
    <div className={`${isSimple ? '' : 'lg:col-span-2'} space-y-4`}>
      {/* Market Info Bar */}
      <MarketInfoBar {...marketInfo} />

      {/* Price Chart */}
      <PriceChart currentPrice={midPrice || 95000} />

      {/* Orderbook & Trade History - Pro mode only */}
      {!isSimple && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Orderbook */}
          <div className="bg-theme-bg-secondary rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-theme-text-secondary">Order Book</h2>
            </div>
            <Orderbook orderbook={orderbook} onPriceClick={handlePriceClick} />
          </div>

          {/* Trade History */}
          <TradeHistory />
        </div>
      )}
    </div>
  );
}
