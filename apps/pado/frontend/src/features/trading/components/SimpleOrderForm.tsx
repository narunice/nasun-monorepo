/**
 * SimpleOrderForm
 * Simplified order form for Simple trading mode
 * - Fixed-height sections to prevent layout shifts
 * - 2x2 amount grid
 * - Always-visible preview section
 */

import { useState, useMemo } from 'react';
import { useMarket } from '../context/MarketContext';

interface SimpleOrderFormProps {
  midPrice?: number;
  onMarketBuy: (baseAmount: number) => void;
  onMarketSell: (baseAmount: number) => void;
  disabled: boolean;
  isLoading: boolean;
  quoteBalance?: number;
  baseBalance?: number;
}

const QUICK_AMOUNTS = [50, 100, 250];

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

  const [usdAmount, setUsdAmount] = useState<number | null>(null);
  const [customInput, setCustomInput] = useState('');
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
  const maxBalance = orderSide === 'buy' ? maxBuyUsd : maxSellUsd;

  // Insufficient balance check
  const isInsufficientBalance = usdAmount !== null && usdAmount > maxBalance;

  // Track if amount was set via quick buttons (for highlighting)
  const isQuickAmount = QUICK_AMOUNTS.includes(usdAmount ?? 0) || usdAmount === Math.floor(maxBalance);

  // Handle custom input change
  const handleCustomInputChange = (value: string) => {
    setCustomInput(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      setUsdAmount(parsed);
    } else if (value === '') {
      setUsdAmount(null);
    }
  };

  // Handle quick amount button click
  const handleQuickAmountClick = (amount: number) => {
    setUsdAmount(amount);
    setCustomInput(''); // Clear custom input when quick amount is selected
  };

  // Button state
  const getButtonState = () => {
    if (isLoading) return { text: 'Processing...', disabled: true };
    if (midPrice <= 0) return { text: 'No Market Liquidity', disabled: true };
    if (!usdAmount) return { text: `Select Amount to ${orderSide === 'buy' ? 'Buy' : 'Sell'}`, disabled: true };
    if (isInsufficientBalance) return { text: 'Insufficient Balance', disabled: true };
    if (baseAmount <= 0) return { text: 'Amount too small', disabled: true };
    return {
      text: `${orderSide === 'buy' ? 'Buy' : 'Sell'} ${baseAmount.toFixed(4)} ${baseSymbol}`,
      disabled: disabled,
    };
  };

  const buttonState = getButtonState();

  const handleExecute = () => {
    if (baseAmount > 0 && !buttonState.disabled) {
      if (orderSide === 'buy') {
        onMarketBuy(baseAmount);
      } else {
        onMarketSell(baseAmount);
      }
      setUsdAmount(null);
      setCustomInput('');
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Buy/Sell Toggle - h-9 (36px) */}
      <div className="h-9 flex bg-theme-bg-tertiary rounded-lg p-1 shrink-0">
        <button
          onClick={() => { setOrderSide('buy'); setUsdAmount(null); setCustomInput(''); }}
          className={`flex-1 text-xs font-semibold rounded-md transition-colors ${
            orderSide === 'buy'
              ? 'bg-green-600/20 text-green-600 dark:text-green-400'
              : 'text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => { setOrderSide('sell'); setUsdAmount(null); setCustomInput(''); }}
          className={`flex-1 text-xs font-semibold rounded-md transition-colors ${
            orderSide === 'sell'
              ? 'bg-red-600/20 text-red-600 dark:text-red-400'
              : 'text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          Sell
        </button>
      </div>

      {/* Amount Selection - 2x2 grid + custom input */}
      <div className="mt-3 shrink-0">
        <div className="text-xs text-theme-text-secondary mb-1.5">
          {orderSide === 'buy' ? 'Buy' : 'Sell'} Amount (NUSDC)
        </div>
        <div className="h-[64px] grid grid-cols-2 gap-1.5">
          {QUICK_AMOUNTS.map((amount) => {
            const isDisabled = disabled || amount > maxBalance;
            const isSelected = usdAmount === amount && isQuickAmount;
            return (
              <button
                key={amount}
                onClick={() => handleQuickAmountClick(amount)}
                disabled={isDisabled}
                className={`h-[30px] text-xs font-medium rounded transition-colors ${
                  isSelected
                    ? 'bg-pd1 text-white'
                    : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                ${amount}
              </button>
            );
          })}
          <button
            onClick={() => maxBalance > 0 && handleQuickAmountClick(Math.floor(maxBalance))}
            disabled={disabled || maxBalance <= 0}
            className={`h-[30px] text-xs font-medium rounded transition-colors ${
              usdAmount === Math.floor(maxBalance) && maxBalance > 0 && isQuickAmount
                ? 'bg-pd1 text-white'
                : 'bg-theme-bg-tertiary text-theme-text-secondary hover:bg-theme-bg-secondary hover:text-theme-text-primary'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Max
          </button>
        </div>
        {/* Custom Amount Input */}
        <div className="mt-2 relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-theme-text-muted">$</span>
          <input
            type="number"
            value={customInput}
            onChange={(e) => handleCustomInputChange(e.target.value)}
            placeholder="Enter custom amount"
            disabled={disabled}
            className="w-full h-[30px] pl-6 pr-2.5 text-xs bg-theme-bg-tertiary border border-theme-border rounded
              text-theme-text-primary placeholder:text-theme-text-muted
              focus:outline-none focus:border-pd1 focus:ring-1 focus:ring-pd1/30
              disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Order Preview - ALWAYS visible, h-[72px] */}
      <div className="mt-3 h-[72px] bg-theme-bg-tertiary/50 rounded-lg p-2.5 flex flex-col justify-center shrink-0">
        {usdAmount && usdAmount > 0 ? (
          <>
            <div className="flex justify-between text-xs">
              <span className="text-theme-text-muted">You {orderSide === 'buy' ? 'pay' : 'receive'}</span>
              <span className="font-mono text-theme-text-primary">${usdAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-theme-text-muted">You {orderSide === 'buy' ? 'receive' : 'sell'}</span>
              <span className="font-mono text-theme-text-primary">~{baseAmount.toFixed(4)} {baseSymbol}</span>
            </div>
            {isInsufficientBalance && (
              <div className="text-[10px] text-red-400 mt-1.5 text-center">
                Insufficient balance (have ${maxBalance.toFixed(2)})
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-theme-text-muted text-center">
            Select an amount or enter custom value
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-h-2" />

      {/* Execute Button - h-10 (40px) */}
      <button
        onClick={handleExecute}
        disabled={buttonState.disabled}
        className={`h-10 w-full rounded-lg text-xs font-semibold text-white transition-colors shrink-0 ${
          orderSide === 'buy'
            ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-600/50'
            : 'bg-red-600 hover:bg-red-700 disabled:bg-red-600/50'
        }`}
      >
        {buttonState.text}
      </button>
    </div>
  );
}
