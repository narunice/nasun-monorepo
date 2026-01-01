/**
 * TradePage
 * DEX 거래 페이지
 * Supports Simple/Pro trading modes
 */

import { OrderFormProvider, MarketProvider } from '../features/trading/context';
import { BalancePanel, MarketPanel, TradingPanel } from '../features/trading/containers';
import { MarketSelector } from '../features/trading/components';
import { useTradeMode } from '../features/trading/hooks';

export function TradePage() {
  const { mode, toggleMode, isSimple } = useTradeMode();

  return (
    <MarketProvider>
      <OrderFormProvider>
        <div className="space-y-4 md:space-y-6">
          {/* Header: Market Selector + Mode Toggle */}
          <div className="flex items-center justify-between gap-4">
            <MarketSelector />

            {/* Simple/Pro Toggle */}
            <div className="flex items-center gap-2">
              <span className={`text-sm ${isSimple ? 'text-theme-text-primary font-medium' : 'text-theme-text-muted'}`}>
                Simple
              </span>
              <button
                onClick={toggleMode}
                className="relative w-12 h-6 rounded-full transition-colors bg-theme-bg-tertiary"
                aria-label={`Switch to ${isSimple ? 'Pro' : 'Simple'} mode`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full transition-all duration-200 ${
                    isSimple
                      ? 'left-1 bg-blue-500'
                      : 'left-7 bg-purple-500'
                  }`}
                />
              </button>
              <span className={`text-sm ${!isSimple ? 'text-theme-text-primary font-medium' : 'text-theme-text-muted'}`}>
                Pro
              </span>
            </div>
          </div>

          {/* Balance Panel - Pro mode only */}
          {!isSimple && <BalancePanel />}

          {/* Main Trading Grid */}
          <div className={`grid gap-4 lg:gap-6 ${
            isSimple
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {/* Market Panel: Chart + Orderbook + Trade History */}
            <MarketPanel mode={mode} />

            {/* Trading Panel: Order Form + BM Card + Open Orders */}
            <TradingPanel mode={mode} />
          </div>
        </div>
      </OrderFormProvider>
    </MarketProvider>
  );
}
