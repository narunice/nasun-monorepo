/**
 * SwapOrderForm
 * Swap-style order form for Simple trading mode.
 * "You Pay / You Receive" layout with flip button, inline token selector,
 * percent-based quick buttons, and 3-view flow (form → confirm → success).
 *
 * Benchmarked from: Binance Convert, Jupiter, Uniswap.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useMarket, type MarketKey } from '../context/MarketContext';
import { useOrderForm } from '../context/OrderFormContext';
import { InlineTokenSelector } from './InlineTokenSelector';
import { SwapConfirmView } from './SwapConfirmView';
import { SwapSuccessView } from './SwapSuccessView';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];
const PERCENT_BUTTONS = [25, 50, 75, 100] as const;

interface SwapOrderFormProps {
  midPrice?: number;
  onMarketBuy: (baseAmount: number) => Promise<boolean>;
  onMarketSell: (baseAmount: number) => Promise<boolean>;
  disabled: boolean;
  isLoading: boolean;
  quoteBalance?: number;
  baseBalance?: number;
}

interface LastTrade {
  payToken: string;
  receiveToken: string;
  payAmount: number;
  receiveAmount: number;
}

export function SwapOrderForm({
  midPrice = 0,
  onMarketBuy,
  onMarketSell,
  disabled,
  isLoading,
  quoteBalance = 0,
  baseBalance = 0,
}: SwapOrderFormProps) {
  const { currentPool, setMarket, markets } = useMarket();
  const { slippage, setSlippage } = useOrderForm();

  // Token state
  const [payToken, setPayToken] = useState('NUSDC');
  const [receiveToken, setReceiveToken] = useState(currentPool.baseToken.symbol);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [view, setView] = useState<'form' | 'confirm' | 'success'>('form');
  const [showSlippage, setShowSlippage] = useState(false);
  const [lastTrade, setLastTrade] = useState<LastTrade | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isBuying = payToken === 'NUSDC';
  const baseSymbol = currentPool.baseToken.symbol;

  // Sync tokens when market changes externally (e.g. header MarketSelector)
  useEffect(() => {
    const base = currentPool.baseToken.symbol;
    if (payToken === 'NUSDC' && receiveToken !== base) {
      setReceiveToken(base);
      setPayAmountInput('');
    } else if (receiveToken === 'NUSDC' && payToken !== base) {
      setPayToken(base);
      setPayAmountInput('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPool.baseToken.symbol]);

  // Token options for selectors
  const tokenOptions = useMemo(() => {
    const opts: Array<{ symbol: string; name: string }> = [
      { symbol: 'NUSDC', name: 'Nasun USDC' },
    ];
    for (const m of markets) {
      opts.push({ symbol: m.pool.baseToken.symbol, name: m.pool.baseToken.name });
    }
    return opts;
  }, [markets]);

  const receiveTokenOptions = useMemo(() => {
    if (isBuying) {
      return tokenOptions.filter(t => t.symbol !== 'NUSDC');
    }
    return [{ symbol: 'NUSDC', name: 'Nasun USDC' }];
  }, [isBuying, tokenOptions]);

  // Update market when token pair changes
  const updateMarketForTokens = useCallback((pay: string, receive: string) => {
    const base = pay === 'NUSDC' ? receive : pay;
    const key = `${base}_NUSDC` as MarketKey;
    if (markets.some(m => m.key === key)) {
      setMarket(key);
    }
  }, [markets, setMarket]);

  const handlePayTokenSelect = useCallback((symbol: string) => {
    if (symbol === receiveToken) {
      setPayToken(receiveToken);
      setReceiveToken(payToken);
    } else {
      setPayToken(symbol);
      if (symbol !== 'NUSDC') {
        setReceiveToken('NUSDC');
      }
      updateMarketForTokens(symbol, symbol === receiveToken ? payToken : receiveToken);
    }
    setPayAmountInput('');
  }, [payToken, receiveToken, updateMarketForTokens]);

  const handleReceiveTokenSelect = useCallback((symbol: string) => {
    if (symbol === payToken) {
      setPayToken(receiveToken);
      setReceiveToken(payToken);
    } else {
      setReceiveToken(symbol);
      updateMarketForTokens(payToken, symbol);
    }
    setPayAmountInput('');
  }, [payToken, receiveToken, updateMarketForTokens]);

  const handleFlip = useCallback(() => {
    const newPay = receiveToken;
    const newReceive = payToken;
    setPayToken(newPay);
    setReceiveToken(newReceive);
    setPayAmountInput('');
  }, [payToken, receiveToken]);

  // Amount calculations
  const payAmount = parseFloat(payAmountInput) || 0;
  const feeBps = currentPool.takerFeeBps;
  const feeRate = feeBps / 10000;
  const feePercent = `${(feeBps / 100).toFixed(2)}%`;

  const baseAmount = useMemo(() => {
    if (payAmount <= 0) return 0;
    const lotSizeDecimal = currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals);

    let rawBase: number;
    if (isBuying) {
      if (!midPrice || midPrice <= 0) return 0;
      rawBase = payAmount / midPrice;
    } else {
      rawBase = payAmount;
    }

    const numLots = Math.floor(rawBase / lotSizeDecimal);
    return parseFloat((numLots * lotSizeDecimal).toFixed(currentPool.baseToken.decimals));
  }, [payAmount, midPrice, isBuying, currentPool]);

  const receiveAmount = useMemo(() => {
    if (baseAmount <= 0 || !midPrice || midPrice <= 0) return 0;
    if (isBuying) return baseAmount;
    // Selling: receive NUSDC net of fee
    return parseFloat((baseAmount * midPrice * (1 - feeRate)).toFixed(2));
  }, [baseAmount, midPrice, isBuying, feeRate]);

  const feeUsd = useMemo(() => {
    if (isBuying) return payAmount * feeRate;
    if (!midPrice || midPrice <= 0) return 0;
    return baseAmount * midPrice * feeRate;
  }, [payAmount, baseAmount, midPrice, isBuying, feeRate]);

  // Balance and validation
  const payBalance = isBuying ? quoteBalance : baseBalance;
  const maxPayAmount = isBuying ? quoteBalance / (1 + feeRate) : baseBalance;
  const isInsufficientBalance = payAmount > 0 && payAmount > maxPayAmount;

  // Percent quick buttons
  const getPercentAmount = useCallback((pct: number) => {
    const raw = maxPayAmount * (pct / 100);
    if (isBuying) {
      return Math.floor(raw * 100) / 100;
    }
    const lotSizeDecimal = currentPool.lotSize / Math.pow(10, currentPool.baseToken.decimals);
    const numLots = Math.floor(raw / lotSizeDecimal);
    return parseFloat((numLots * lotSizeDecimal).toFixed(currentPool.baseToken.decimals));
  }, [maxPayAmount, isBuying, currentPool]);

  const handlePercentClick = (pct: number) => {
    const amount = getPercentAmount(pct);
    if (amount > 0) setPayAmountInput(String(amount));
  };

  // Input handler (allow valid decimal numbers only)
  const handlePayAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setPayAmountInput(value);
    }
  };

  // Preview → Confirm → Execute
  const handlePreview = () => {
    if (baseAmount > 0 && !disabled && !isInsufficientBalance) {
      setView('confirm');
    }
  };

  const handleConfirm = async () => {
    if (baseAmount <= 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const success = isBuying
        ? await onMarketBuy(baseAmount)
        : await onMarketSell(baseAmount);

      if (success) {
        setLastTrade({ payToken, receiveToken, payAmount, receiveAmount });
        setView('success');
        setPayAmountInput('');
      } else {
        setView('form');
      }
    } catch {
      setView('form');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewSwap = () => {
    setView('form');
    setLastTrade(null);
  };

  // Button state
  const getPreviewButtonState = () => {
    if (isLoading) return { text: 'Processing...', disabled: true };
    if (midPrice <= 0) return { text: 'No Market Liquidity', disabled: true };
    if (payAmount <= 0) return { text: 'Enter Amount', disabled: true };
    if (isInsufficientBalance) return { text: 'Insufficient Balance', disabled: true };
    if (baseAmount <= 0) return { text: 'Amount Too Small', disabled: true };
    return { text: 'Preview Swap', disabled };
  };
  const previewBtn = getPreviewButtonState();

  // Exchange rate
  const rateDisplay = midPrice > 0
    ? `1 ${baseSymbol} = $${midPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : '...';

  // --- Render views ---

  if (view === 'confirm') {
    return (
      <SwapConfirmView
        payToken={payToken}
        receiveToken={receiveToken}
        payAmount={payAmount}
        receiveAmount={receiveAmount}
        fee={feeUsd}
        feePercent={feePercent}
        slippage={slippage}
        midPrice={midPrice}
        baseSymbol={baseSymbol}
        onConfirm={handleConfirm}
        onBack={() => setView('form')}
        isLoading={isLoading || isSubmitting}
      />
    );
  }

  if (view === 'success' && lastTrade) {
    return (
      <SwapSuccessView
        payToken={lastTrade.payToken}
        receiveToken={lastTrade.receiveToken}
        payAmount={lastTrade.payAmount}
        receiveAmount={lastTrade.receiveAmount}
        onNewSwap={handleNewSwap}
      />
    );
  }

  const payDisplayDecimals = isBuying ? 2 : 6;

  return (
    <div className="h-full flex flex-col">
      {/* Exchange Rate */}
      <div className="text-xs text-theme-text-muted mb-3 shrink-0 font-mono">
        {rateDisplay}
      </div>

      {/* You Pay */}
      <div className="bg-theme-bg-tertiary/50 rounded-lg p-3 shrink-0">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-theme-text-muted">You Pay</span>
          <span className="text-theme-text-muted font-mono">
            Bal: {payBalance.toLocaleString('en-US', { maximumFractionDigits: payDisplayDecimals })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <InlineTokenSelector
            selectedToken={payToken}
            tokens={tokenOptions}
            onSelect={handlePayTokenSelect}
            disabled={disabled}
          />
          <input
            type="text"
            inputMode="decimal"
            value={payAmountInput}
            onChange={handlePayAmountChange}
            placeholder="0.00"
            disabled={disabled}
            className="flex-1 min-w-0 bg-transparent text-right text-sm font-mono text-theme-text-primary placeholder:text-theme-text-muted/50 outline-none"
          />
        </div>
        {/* Percent buttons */}
        <div className="flex gap-1.5 mt-2">
          {PERCENT_BUTTONS.map((pct) => (
            <button
              key={pct}
              onClick={() => handlePercentClick(pct)}
              disabled={disabled || maxPayAmount <= 0}
              className="flex-1 h-6 text-[10px] font-medium rounded bg-theme-bg-secondary text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pct === 100 ? 'Max' : `${pct}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Flip Button */}
      <div className="flex justify-center -my-1.5 relative z-10 shrink-0">
        <button
          onClick={handleFlip}
          disabled={disabled}
          className="w-8 h-8 rounded-full bg-theme-bg-secondary border-2 border-theme-bg-tertiary flex items-center justify-center text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary transition-colors disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M4 4l3-3 3 3M4 10l3 3 3-3"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* You Receive */}
      <div className="bg-theme-bg-tertiary/50 rounded-lg p-3 shrink-0">
        <div className="text-xs text-theme-text-muted mb-2">You Receive</div>
        <div className="flex items-center gap-2">
          <InlineTokenSelector
            selectedToken={receiveToken}
            tokens={receiveTokenOptions}
            onSelect={handleReceiveTokenSelect}
            disabled={disabled}
          />
          <div className="flex-1 text-right text-sm font-mono text-theme-text-secondary">
            {receiveAmount > 0
              ? `≈ ${receiveAmount.toLocaleString('en-US', { maximumFractionDigits: isBuying ? 6 : 2 })}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Rate + Fee + Slippage toggle */}
      <div className="mt-2 flex items-center justify-between text-[10px] text-theme-text-muted shrink-0">
        <div className="flex items-center gap-2 min-w-0 truncate">
          <span>Fee: ~${feeUsd.toFixed(2)}</span>
        </div>
        <button
          onClick={() => setShowSlippage(!showSlippage)}
          className="shrink-0 p-1 text-theme-text-muted hover:text-theme-text-secondary transition-colors"
          title="Slippage Settings"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="6" cy="6" r="1.5" />
            <path d="M6 .75v1.5M6 9.75v1.5M.75 6h1.5M9.75 6h1.5M2.28 2.28l1.06 1.06M8.66 8.66l1.06 1.06M9.72 2.28L8.66 3.34M3.34 8.66l-1.06 1.06" />
          </svg>
        </button>
      </div>

      {/* Slippage Settings (expandable) */}
      {showSlippage && (
        <div className="mt-1 flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-theme-text-muted">Slippage:</span>
          {SLIPPAGE_PRESETS.map((pct) => (
            <button
              key={pct}
              onClick={() => setSlippage(pct)}
              className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors ${
                slippage === pct
                  ? 'bg-pd1 text-white'
                  : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
      )}

      {/* Insufficient balance warning */}
      {isInsufficientBalance && (
        <div className="mt-1.5 text-[10px] text-red-400 text-center shrink-0">
          Insufficient balance (have {payBalance.toLocaleString('en-US', { maximumFractionDigits: payDisplayDecimals })})
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1 min-h-2" />

      {/* Preview Button */}
      <button
        onClick={handlePreview}
        disabled={previewBtn.disabled}
        className="h-10 w-full rounded-lg text-xs font-semibold text-white bg-pd1 hover:bg-pd1/80 disabled:bg-pd1/60 transition-colors shrink-0"
      >
        {previewBtn.text}
      </button>
    </div>
  );
}
