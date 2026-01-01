/**
 * SimpleOrderForm
 * Simplified order form for Simple trading mode
 * - USD-based amounts
 * - Market orders only
 * - Quick amount buttons
 */

import { useState, useMemo } from 'react';
import { useMarket } from '../context/MarketContext';
import { QuickAmountButtons } from './QuickAmountButtons';

interface SimpleOrderFormProps {
  midPrice?: number;
  onMarketBuy: (baseAmount: number) => void;
  onMarketSell: (baseAmount: number) => void;
  disabled: boolean;
  isLoading: boolean;
  quoteBalance?: number;
  baseBalance?: number;
}

export function SimpleOrderForm({
  midPrice = 0,
  onMarketBuy,
  onMarketSell,
  disabled,
  isLoading,
  quoteBalance = 0,
  baseBalance = 0,
}: SimpleOrderFormProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  const [usdAmount, setUsdAmount] = useState<number | null>(null);
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');

  // Calculate base token amount from USD
  const baseAmount = useMemo(() => {
    if (!usdAmount || !midPrice || midPrice <= 0) return 0;
    return usdAmount / midPrice;
  }, [usdAmount, midPrice]);

  // Max values
  const maxBuyUsd = quoteBalance;
  const maxSellUsd = baseBalance * midPrice;

  const handleQuickAmount = (amount: number) => {
    setUsdAmount(amount);
  };

  const handleBuy = () => {
    if (baseAmount > 0) {
      onMarketBuy(baseAmount);
      setUsdAmount(null);
    }
  };

  const handleSell = () => {
    if (baseAmount > 0) {
      onMarketSell(baseAmount);
      setUsdAmount(null);
    }
  };

  const isButtonDisabled = disabled || isLoading || !usdAmount || baseAmount <= 0;

  return (
    <div className="space-y-4">
      {/* Buy/Sell Toggle */}
      <div className="flex bg-theme-bg-tertiary rounded-lg p-1">
        <button
          onClick={() => setOrderSide('buy')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-colors ${
            orderSide === 'buy'
              ? 'bg-green-600 text-white shadow-sm'
              : 'text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => setOrderSide('sell')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-md transition-colors ${
            orderSide === 'sell'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Market Price Display */}
      {midPrice > 0 && (
        <div className="p-3 bg-theme-bg-tertiary/50 rounded text-center">
          <div className="text-xs text-theme-text-muted mb-1">Market Price</div>
          <div className="text-lg font-bold text-theme-text-primary">
            ${midPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* Quick Amount Buttons */}
      <div>
        <div className="text-sm text-theme-text-secondary mb-2">
          {orderSide === 'buy' ? 'Buy Amount' : 'Sell Amount'} ({quoteSymbol})
        </div>
        <QuickAmountButtons
          onSelect={handleQuickAmount}
          maxBalance={orderSide === 'buy' ? maxBuyUsd : maxSellUsd}
          disabled={disabled}
          selectedAmount={usdAmount ?? undefined}
        />
      </div>

      {/* Amount Summary */}
      {usdAmount && usdAmount > 0 && (
        <div className="p-3 bg-theme-bg-tertiary/50 rounded space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-theme-text-secondary">You {orderSide === 'buy' ? 'pay' : 'receive'}</span>
            <span className="font-mono text-theme-text-primary">
              ${usdAmount.toFixed(2)} {quoteSymbol}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-theme-text-secondary">You {orderSide === 'buy' ? 'receive' : 'sell'}</span>
            <span className="font-mono text-theme-text-primary">
              ~{baseAmount.toFixed(4)} {baseSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Available Balance */}
      <div className="text-xs text-theme-text-muted text-right">
        Available: {orderSide === 'buy'
          ? `${quoteBalance.toFixed(2)} ${quoteSymbol}`
          : `${baseBalance.toFixed(4)} ${baseSymbol}`}
      </div>

      {/* Execute Button */}
      <button
        onClick={orderSide === 'buy' ? handleBuy : handleSell}
        disabled={isButtonDisabled}
        className={`w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 ${
          orderSide === 'buy'
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-red-600 hover:bg-red-700'
        }`}
      >
        {isLoading
          ? 'Processing...'
          : usdAmount
            ? `${orderSide === 'buy' ? 'Buy' : 'Sell'} ${baseAmount.toFixed(4)} ${baseSymbol}`
            : `Select Amount to ${orderSide === 'buy' ? 'Buy' : 'Sell'}`}
      </button>

      {/* Info Text */}
      <p className="text-xs text-theme-text-muted text-center">
        Market order executes at best available price
      </p>
    </div>
  );
}
