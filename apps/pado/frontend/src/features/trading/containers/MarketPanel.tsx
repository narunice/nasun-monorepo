/**
 * MarketPanel Container
 * 차트 + 오더북 + 거래 이력 (lg:col-span-2)
 * Simple mode: Chart only
 * Pro mode: Chart + Orderbook + Trade History
 */

import { useOrderbook, type TradeMode } from '../hooks';
import { useOrderForm, useMarket } from '../context';
import { PriceChart, Orderbook, TradeHistory } from '../components';

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

  // 오더북 가격 클릭 시 주문 폼에 입력
  const handlePriceClick = (price: number) => {
    setPrice(price.toFixed(2));
  };

  return (
    <div className={`${isSimple ? '' : 'lg:col-span-2'} space-y-4`}>
      {/* Price Chart */}
      <PriceChart currentPrice={midPrice || 95000} />

      {/* Orderbook & Trade History - Pro mode only */}
      {!isSimple && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Orderbook */}
          <div className="bg-theme-bg-secondary rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {currentPool.baseToken.symbol}/{currentPool.quoteToken.symbol}
                </h2>
                <p className="text-xs text-theme-text-muted">Orderbook</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-green-400">
                  ${midPrice > 0 ? midPrice.toFixed(2) : '0.00'}
                </p>
                <p className="text-xs text-theme-text-muted">Mid Price</p>
              </div>
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
