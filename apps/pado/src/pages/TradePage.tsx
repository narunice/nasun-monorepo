/**
 * TradePage
 * DEX 거래 페이지
 */

import { OrderFormProvider, MarketProvider } from '../features/trading/context';
import { BalancePanel, MarketPanel, TradingPanel } from '../features/trading/containers';
import { MarketSelector } from '../features/trading/components';

export function TradePage() {
  return (
    <MarketProvider>
      <OrderFormProvider>
        <div className="space-y-6">
          {/* Market Selector */}
          <div className="flex items-center justify-between">
            <MarketSelector />
          </div>

          {/* Balance Panel */}
          <BalancePanel />

          {/* Main Trading Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Market Panel: Chart + Orderbook + Trade History */}
            <MarketPanel />

            {/* Trading Panel: Order Form + BM Card + Open Orders */}
            <TradingPanel />
          </div>
        </div>
      </OrderFormProvider>
    </MarketProvider>
  );
}
