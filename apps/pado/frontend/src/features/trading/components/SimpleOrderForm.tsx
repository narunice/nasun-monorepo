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
import { InsufficientBalancePrompt } from './InsufficientBalancePrompt';

interface SimpleOrderFormProps {
  midPrice?: number;
  onMarketBuy: (baseAmount: number) => void;
  onMarketSell: (baseAmount: number) => void;
  disabled: boolean;
  isLoading: boolean;
  /** Trading balance - quote token (for Max button calculation) */
  quoteBalance?: number;
  /** Trading balance - base token (for Max button calculation) */
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

  // Calculate base token amount from USD (rounded to lot size)
  const baseAmount = useMemo(() => {
    if (!usdAmount || !midPrice || midPrice <= 0) return 0;
    const rawAmount = usdAmount / midPrice;
    const lotSizeDecimal = currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals);
    return Math.floor(rawAmount / lotSizeDecimal) * lotSizeDecimal;
  }, [usdAmount, midPrice, currentPool]);

  // Max values
  const maxBuyUsd = quoteBalance;
  const maxSellUsd = baseBalance * midPrice;

  // Insufficient balance check (Phase 2)
  const insufficientForBuy = orderSide === 'buy' && usdAmount !== null && usdAmount > maxBuyUsd;
  const insufficientForSell = orderSide === 'sell' && usdAmount !== null && usdAmount > maxSellUsd;
  const isInsufficientBalance = insufficientForBuy || insufficientForSell;

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

  const isButtonDisabled = disabled || isLoading || midPrice <= 0 || !usdAmount || baseAmount <= 0 || isInsufficientBalance;

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

      {/* No Liquidity Warning */}
      {midPrice <= 0 && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-400">No market liquidity</p>
              <p className="text-xs text-theme-text-muted mt-1">
                No market liquidity yet. Switch to Pro mode to place limit orders.
              </p>
            </div>
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

      {/* Zero Balance Warning */}
      {orderSide === 'buy' && quoteBalance <= 0 && (
        <InsufficientBalancePrompt
          tokenSymbol={quoteSymbol}
          requiredAmount={50}
          availableAmount={quoteBalance}
          message={`Get ${quoteSymbol} from Faucet in your wallet to start`}
        />
      )}
      {orderSide === 'sell' && baseBalance <= 0 && (
        <InsufficientBalancePrompt
          tokenSymbol={baseSymbol}
          requiredAmount={0.001}
          availableAmount={baseBalance}
          message={`Get ${baseSymbol} from Faucet in your wallet to sell`}
        />
      )}

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
          {/* Insufficient Balance Warning */}
          {insufficientForBuy && (
            <div className="pt-2 border-t border-theme-border/30">
              <InsufficientBalancePrompt
                tokenSymbol={quoteSymbol}
                requiredAmount={usdAmount}
                availableAmount={quoteBalance}
              />
            </div>
          )}
          {insufficientForSell && (
            <div className="pt-2 border-t border-theme-border/30">
              <InsufficientBalancePrompt
                tokenSymbol={baseSymbol}
                requiredAmount={usdAmount / midPrice}
                availableAmount={baseBalance}
              />
            </div>
          )}
        </div>
      )}

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
          : midPrice <= 0
            ? 'No Market Liquidity'
            : usdAmount
              ? `${orderSide === 'buy' ? 'Buy' : 'Sell'} ${baseAmount.toFixed(4)} ${baseSymbol}`
              : `Select Amount to ${orderSide === 'buy' ? 'Buy' : 'Sell'}`}
      </button>

      {/* Info Text */}
      <p className="text-xs text-theme-text-muted text-center">
        Fills at best available price
      </p>
    </div>
  );
}
