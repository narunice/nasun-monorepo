/**
 * SwapOrderForm
 * Swap-style order form for Simple trading mode.
 * "Sell / Buy" layout (Uniswap-style) with flip button, inline token selector,
 * percent-based quick buttons, collapsible details, and 3-view flow (form → confirm → success).
 *
 * Benchmarked from: Uniswap, Jupiter, Binance Convert.
 * Follows ethereum.org DEX design best practices.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useMarket } from '../context/MarketContext';
import { useOrderForm } from '../context/OrderFormContext';
import { InlineTokenSelector } from './InlineTokenSelector';
import { SwapConfirmView } from './SwapConfirmView';
import { SwapSuccessView } from './SwapSuccessView';
import { getPriceImpactColorClass } from '../utils/priceImpact';
import { isStablecoin } from '../../../config/network';
import type { PriceLevel } from '../../../lib/deepbook';

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];
const PERCENT_BUTTONS = [25, 50, 75, 100] as const;

interface SwapOrderFormProps {
  midPrice?: number;
  bids?: PriceLevel[];
  asks?: PriceLevel[];
  onMarketBuy: (baseAmount: number) => Promise<boolean>;
  onMarketSell: (baseAmount: number) => Promise<boolean>;
  disabled: boolean;
  isLoading: boolean;
  quoteBalance?: number;
  baseBalance?: number;
  onWithdraw?: (token: string) => void;
  /** When null, trading is not enabled (no BalanceManager). Buy/Sell will be blocked. */
  balanceManagerId?: string | null;
}

interface LastTrade {
  payToken: string;
  receiveToken: string;
  payAmount: number;
  receiveAmount: number;
  isBuying: boolean;
}

export function SwapOrderForm({
  midPrice = 0,
  bids = [],
  asks = [],
  onMarketBuy,
  onMarketSell,
  disabled,
  isLoading,
  quoteBalance = 0,
  baseBalance = 0,
  onWithdraw,
  balanceManagerId = null,
}: SwapOrderFormProps) {
  const tradingDisabled = balanceManagerId === null;
  const { currentPool, setMarket, markets } = useMarket();
  const { slippage, setSlippage } = useOrderForm();

  // Token state
  const [payToken, setPayToken] = useState('NUSDC');
  const [receiveToken, setReceiveToken] = useState(currentPool.baseToken.symbol);
  const [payAmountInput, setPayAmountInput] = useState('');
  const [view, setView] = useState<'form' | 'confirm' | 'success'>('form');
  const [showDetails, setShowDetails] = useState(false);
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
    const market = markets.find(m => m.pool.baseToken.symbol === base);
    if (market) {
      setMarket(market.key);
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

  // USD equivalent for display
  const payUsd = useMemo(() => {
    if (payAmount <= 0) return 0;
    if (isBuying) return payAmount; // NUSDC ≈ $1
    return midPrice > 0 ? payAmount * midPrice : 0;
  }, [payAmount, isBuying, midPrice]);

  const receiveUsd = useMemo(() => {
    if (receiveAmount <= 0) return 0;
    if (isBuying) return midPrice > 0 ? receiveAmount * midPrice : 0;
    return receiveAmount; // NUSDC ≈ $1
  }, [receiveAmount, isBuying, midPrice]);

  // Minimum received after slippage
  const minReceived = useMemo(() => {
    if (receiveAmount <= 0) return 0;
    return receiveAmount * (1 - slippage / 100);
  }, [receiveAmount, slippage]);

  // Price impact from orderbook depth (VWAP calculation)
  const priceImpact = useMemo(() => {
    if (baseAmount <= 0 || !midPrice || midPrice <= 0) {
      return { avgPrice: 0, impactPct: 0, fillable: true, filledQty: 0 };
    }
    // Buy consumes asks (ascending price), sell consumes bids (descending price)
    const levels = isBuying ? asks : bids;
    if (levels.length === 0) {
      return { avgPrice: 0, impactPct: 0, fillable: false, filledQty: 0 };
    }
    let remaining = baseAmount;
    let totalCost = 0;
    let filledQty = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      const fill = Math.min(remaining, level.quantity);
      totalCost += fill * level.price;
      filledQty += fill;
      remaining -= fill;
    }
    const avgPrice = filledQty > 0 ? totalCost / filledQty : 0;
    const impactPct = midPrice > 0 && avgPrice > 0
      ? Math.abs(avgPrice - midPrice) / midPrice * 100
      : 0;
    return { avgPrice, impactPct, fillable: remaining <= 0, filledQty };
  }, [baseAmount, midPrice, isBuying, asks, bids]);

  // Balance and validation
  // quoteBalance/baseBalance reflect Pado Balance (BM + MA NUSDC, BM-only base).
  // Wallet auto-deposit can top BM up at order time, but the "Pado Balance"
  // label only counts funds already inside Pado.
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
        setLastTrade({ payToken, receiveToken, payAmount, receiveAmount, isBuying });
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

  // Action label based on direction
  const actionLabel = isBuying ? 'Buy' : 'Sell';

  // Button state
  const directionVariant = isBuying ? 'buy' : 'sell';
  const getPreviewButtonState = (): { text: string; disabled: boolean; variant: 'buy' | 'sell' | 'error' } => {
    if (tradingDisabled) return { text: 'Enable Trading first', disabled: true, variant: 'error' };
    if (isLoading) return { text: 'Processing...', disabled: true, variant: directionVariant };
    if (midPrice <= 0) return { text: 'No Market Liquidity', disabled: true, variant: directionVariant };
    if (payAmount <= 0) return { text: 'Enter Amount', disabled: true, variant: directionVariant };
    if (isInsufficientBalance) return { text: `Insufficient ${payToken}`, disabled: true, variant: 'error' };
    if (baseAmount <= 0) return { text: 'Amount Too Small', disabled: true, variant: directionVariant };
    return { text: `Preview ${actionLabel}`, disabled, variant: directionVariant };
  };
  const previewBtn = getPreviewButtonState();

  // Exchange rate
  const rateDisplay = midPrice > 0
    ? `1 ${baseSymbol} = $${midPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : '...';

  const payDisplayDecimals = isBuying ? 2 : 6;

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
        avgPrice={priceImpact.avgPrice > 0 ? priceImpact.avgPrice : undefined}
        impactPct={priceImpact.impactPct > 0 ? priceImpact.impactPct : undefined}
        onConfirm={handleConfirm}
        onBack={() => setView('form')}
        isLoading={isLoading || isSubmitting}
        isBuying={isBuying}
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
        isBuying={lastTrade.isBuying}
        onNewSwap={handleNewSwap}
        onWithdraw={onWithdraw}
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* You Pay */}
      <div className="bg-theme-bg-tertiary/50 rounded-r-lg p-4 shrink-0 border-l-4 border-red-500/50">
        <div className="flex items-center justify-between text-sm xl:text-base mb-2">
          <div className="flex items-center gap-2">
            <span className="text-theme-text-muted font-medium">You Pay</span>
            <InlineTokenSelector
              selectedToken={payToken}
              tokens={tokenOptions}
              onSelect={handlePayTokenSelect}
              disabled={disabled}
            />
          </div>
          <button
            onClick={() => handlePercentClick(100)}
            disabled={disabled || maxPayAmount <= 0}
            className="text-theme-text-muted font-mono text-xs hover:text-theme-text-primary transition-colors disabled:cursor-default disabled:hover:text-theme-text-muted"
            title="Click to use max balance"
          >
            Pado Balance: {payBalance.toLocaleString('en-US', { maximumFractionDigits: payDisplayDecimals })}
          </button>
        </div>
        <div>
          <input
            type="text"
            inputMode="decimal"
            aria-label={`Amount of ${payToken} to pay`}
            value={payAmountInput}
            onChange={handlePayAmountChange}
            placeholder="0.00"
            disabled={disabled}
            className="w-full bg-transparent text-lg font-mono text-theme-text-primary placeholder:text-theme-text-muted/50 outline-none"
          />
        </div>
        {/* USD equivalent + percent buttons */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1.5">
            {PERCENT_BUTTONS.map((pct) => (
              <button
                key={pct}
                onClick={() => handlePercentClick(pct)}
                disabled={disabled || maxPayAmount <= 0}
                className="px-2 h-6 text-xs font-medium rounded bg-theme-bg-secondary text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {pct === 100 ? 'Max' : `${pct}%`}
              </button>
            ))}
          </div>
          {payUsd > 0 && !isStablecoin(payToken) && (
            <span className="text-xs text-theme-text-muted font-mono">
              ~${payUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>

      {/* Flip Button */}
      <div className="flex justify-center -my-2 relative z-10 shrink-0">
        <button
          onClick={handleFlip}
          disabled={disabled}
          className="w-9 h-9 rounded-full bg-theme-bg-secondary border-2 border-theme-bg-tertiary flex items-center justify-center text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary transition-colors disabled:opacity-40"
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
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
      <div className="bg-theme-bg-tertiary/50 rounded-r-lg p-4 shrink-0 border-l-4 border-green-500/50">
        <div className="flex items-center gap-2 text-sm xl:text-base mb-2">
          <span className="text-theme-text-muted font-medium">You Receive</span>
          <InlineTokenSelector
            selectedToken={receiveToken}
            tokens={receiveTokenOptions}
            onSelect={handleReceiveTokenSelect}
            disabled={disabled}
          />
        </div>
        <div className="text-lg font-mono text-theme-text-secondary">
          {receiveAmount > 0
            ? `${receiveAmount.toLocaleString('en-US', { maximumFractionDigits: isBuying ? 6 : 2 })}`
            : '0.00'}
        </div>
        {receiveUsd > 0 && !isStablecoin(receiveToken) && (
          <div className="mt-2 text-right">
            <span className="text-xs text-theme-text-muted font-mono">
              ~${receiveUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* Collapsible Details Accordion */}
      {midPrice > 0 && (
        <div className="mt-3 shrink-0">
          {/* Accordion header: exchange rate + chevron */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-xs xl:text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
          >
            <span className="font-mono">{rateDisplay}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showDetails ? 'rotate-180' : ''}`}
            >
              <path d="M3 4.5l3 3 3-3" />
            </svg>
          </button>

          {/* Expanded details */}
          {showDetails && (
            <div className="mt-2 space-y-1.5 px-3 py-2 bg-theme-bg-tertiary/50 rounded text-xs xl:text-sm">
              {priceImpact.avgPrice > 0 && (
                <div className="flex justify-between">
                  <span className="text-theme-text-muted">Price Impact</span>
                  <span className={`font-mono font-medium ${getPriceImpactColorClass(priceImpact.impactPct)}`}>
                    {priceImpact.impactPct < 0.01 ? '<0.01' : priceImpact.impactPct.toFixed(2)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Fee ({feePercent})</span>
                <span className="font-mono text-theme-text-muted">~${feeUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Slippage Tolerance</span>
                <div className="flex items-center gap-1">
                  {SLIPPAGE_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setSlippage(pct)}
                      className={`px-1.5 py-0.5 text-xs font-medium rounded transition-colors ${
                        slippage === pct
                          ? 'bg-pd1 text-white'
                          : 'bg-theme-bg-secondary text-theme-text-muted hover:text-theme-text-secondary'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
              {minReceived > 0 && (
                <div className="flex justify-between">
                  <span className="text-theme-text-muted">Min. Received</span>
                  <span className="font-mono text-theme-text-secondary">
                    {minReceived.toLocaleString('en-US', { maximumFractionDigits: isBuying ? 6 : 2 })} {receiveToken}
                  </span>
                </div>
              )}
              {!priceImpact.fillable && (
                <p role="alert" className="text-red-700 dark:text-red-400 mt-1">
                  Insufficient liquidity — only {priceImpact.filledQty.toFixed(4)} fillable
                </p>
              )}
              {priceImpact.impactPct >= 2 && priceImpact.fillable && (
                <p role="alert" className="text-amber-700 dark:text-yellow-400 mt-1">
                  High price impact. Consider reducing size or using Pro mode.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1 min-h-3" />

      {/* Preview Button */}
      <button
        onClick={handlePreview}
        disabled={previewBtn.disabled}
        className={`h-12 w-full rounded-lg text-sm xl:text-base font-semibold transition-colors shrink-0 ${
          previewBtn.variant === 'error'
            ? 'bg-red-500/20 text-red-400 cursor-not-allowed'
            : previewBtn.variant === 'buy'
            ? 'text-white bg-green-600 hover:bg-green-600/80 disabled:bg-green-600/40'
            : 'text-white bg-red-600 hover:bg-red-600/80 disabled:bg-red-600/40'
        }`}
      >
        {previewBtn.text}
      </button>
    </div>
  );
}
