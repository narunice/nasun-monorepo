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
  walletQuoteBalance?: string;
  walletBaseBalance?: string;
}

export function SimpleOrderForm({
  midPrice = 0,
  onMarketBuy,
  onMarketSell,
  disabled,
  isLoading,
  quoteBalance = 0,
  baseBalance = 0,
  walletQuoteBalance = '0',
  walletBaseBalance = '0',
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
      {/* Balance Overview */}
      <div className="p-3 bg-theme-bg-tertiary/50 rounded-lg">
        <div className="text-xs text-theme-text-muted mb-2">Your Balance</div>
        <div className="grid grid-cols-2 gap-3">
          {/* Wallet Column */}
          <div>
            <div className="text-[10px] text-theme-text-muted mb-1">Wallet</div>
            <div className="text-sm font-mono text-theme-text-primary">
              {walletBaseBalance} {baseSymbol}
            </div>
            <div className="text-sm font-mono text-theme-text-secondary">
              {walletQuoteBalance} {quoteSymbol}
            </div>
          </div>
          {/* Trading Column */}
          <div>
            <div className="text-[10px] text-theme-text-muted mb-1">Trading</div>
            <div className="text-sm font-mono text-theme-text-primary">
              {baseBalance.toFixed(4)} {baseSymbol}
            </div>
            <div className="text-sm font-mono text-theme-text-secondary">
              {quoteBalance.toFixed(2)} {quoteSymbol}
            </div>
          </div>
        </div>
        {/* Deposit hint when Trading balance is empty */}
        {quoteBalance === 0 && baseBalance === 0 && (
          <div className="mt-2 text-xs text-theme-text-muted">
            Deposit to Trading balance to start trading
          </div>
        )}
      </div>

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
