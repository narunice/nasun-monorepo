import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { getPriceImpactColorClass, PRICE_IMPACT_CONFIRM_THRESHOLD } from '../utils/priceImpact';
import type { ExecutionOption } from '../context';
import { useMarket, useOrderForm } from '../context';
import { UnderlineTabs } from '@/components/common';
import { SlippageSettings } from './SlippageSettings';
import { InsufficientBalancePrompt } from './InsufficientBalancePrompt';
import { NumberInput } from '@/components/ui/NumberInput';
import { validateQuantity, validatePrice, getMinQuantity, getMinPrice, snapToTick, snapToLot, type PriceLevel } from '../../../lib/deepbook';
import { TPSLInputs } from './TPSLInputs';
import { ScaleOrderForm, type ScaleOrderItem } from './ScaleOrderForm';
import {
  SHORTCUT_PERCENT_EVENT,
  SHORTCUT_PRICE_STEP_EVENT,
  SHORTCUT_SUBMIT_EVENT,
} from '../hooks/useKeyboardShortcuts';

// Execution Option descriptions
const EXECUTION_OPTIONS: { value: ExecutionOption; label: string; description: string }[] = [
  { value: 'GTC', label: 'GTC', description: 'Good-Til-Canceled' },
  { value: 'IOC', label: 'IOC', description: 'Immediate-Or-Cancel' },
  { value: 'FOK', label: 'FOK', description: 'Fill-Or-Kill' },
  { value: 'POST_ONLY', label: 'Post', description: 'Maker only' },
];

interface OrderFormProps {
  price: string;
  amount: string;
  onPriceChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onOrder: (side: 'buy' | 'sell') => void;
  onMarketOrder: (side: 'buy' | 'sell') => void;
  disabled: boolean;
  isLoading: boolean;
  isAutoDepositing?: boolean;
  midPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  executionOption?: ExecutionOption;
  onExecutionOptionChange?: (option: ExecutionOption) => void;
  slippage?: number;
  onSlippageChange?: (value: number) => void;
  availableQuote?: number;
  availableBase?: number;
  lockedQuote?: number;
  lockedBase?: number;
  side: 'buy' | 'sell';
  onSideChange: (side: 'buy' | 'sell') => void;
  bids?: PriceLevel[];
  asks?: PriceLevel[];
  onScaleOrder?: (orders: ScaleOrderItem[], side: 'buy' | 'sell') => void;
}

export function OrderForm({
  price,
  amount,
  onPriceChange,
  onAmountChange,
  onOrder,
  onMarketOrder,
  disabled,
  isLoading,
  isAutoDepositing = false,
  midPrice,
  bestBid = 0,
  bestAsk = 0,
  executionOption = 'GTC',
  onExecutionOptionChange,
  slippage = 0.5,
  onSlippageChange,
  availableQuote = 0,
  availableBase = 0,
  lockedQuote = 0,
  lockedBase = 0,
  side,
  onSideChange,
  bids = [],
  asks = [],
  onScaleOrder,
}: OrderFormProps) {
  const { currentPool } = useMarket();
  const { orderMode, setOrderMode, tpslEnabled, setTpslEnabled, tpPrice, setTpPrice, slPrice: slPriceValue, setSlPrice, stopPrice, setStopPrice, trailValue, setTrailValue, trailMode, setTrailMode, ocoEnabled, setOcoEnabled, setFocusedPriceField, autoDepositEnabled } = useOrderForm();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  const [totalInput, setTotalInput] = useState('');
  const [activeField, setActiveField] = useState<'amount' | 'total'>('amount');
  const [impactAcked, setImpactAcked] = useState(false);

  const isMarket = orderMode === 'market';
  const isStopLimit = orderMode === 'stop-limit';
  const isTrailingStop = orderMode === 'trailing-stop';
  const isScale = orderMode === 'scale';
  const isBuy = side === 'buy';

  const effectivePrice = useMemo(
    () => (isMarket || isTrailingStop) ? (midPrice || 0) : parseFloat(price) || 0,
    [isMarket, isTrailingStop, midPrice, price]
  );
  const amountNum = parseFloat(amount) || 0;
  const total = effectivePrice * amountNum;

  // Fee calculation based on execution option
  const isMakerFee = executionOption === 'POST_ONLY';
  const feeBps = isMakerFee ? currentPool.makerFeeBps : currentPool.takerFeeBps;
  const feeRate = feeBps / 10000;
  const fee = total * feeRate;
  const feeLabel = isMakerFee ? 'Maker' : 'Taker';
  const feePercent = `${(feeBps / 100).toFixed(2)}%`;

  // Balance check for the active side (includes fee for buy side)
  // availableQuote/availableBase already include wallet + BM combined total.
  // Auto deposit moves wallet funds to BM but cannot create funds, so validate against full balance.
  const insufficientForBuy = total > 0 && (total + fee) > availableQuote;
  const insufficientForSell = amountNum > 0 && amountNum > availableBase;
  const isInsufficient = isBuy ? insufficientForBuy : insufficientForSell;

  // Validation
  const priceValidation = useMemo(
    () => validatePrice(effectivePrice, currentPool),
    [effectivePrice, currentPool]
  );
  const quantityValidation = useMemo(
    () => validateQuantity(amountNum, currentPool),
    [amountNum, currentPool]
  );
  const minQuantity = useMemo(() => getMinQuantity(currentPool), [currentPool]);
  const minPrice = useMemo(() => getMinPrice(currentPool), [currentPool]);

  const handleSubmit = useCallback(() => {
    if (isMarket) {
      onMarketOrder(side);
    } else {
      onOrder(side);
    }
  }, [isMarket, side, onMarketOrder, onOrder]);

  // Price suggestion helpers
  const handlePriceSelect = useCallback((p: number) => {
    if (p > 0) {
      const snapped = snapToTick(p, currentPool);
      if (snapped > 0) {
        onPriceChange(snapped.toString());
      }
    }
  }, [onPriceChange, currentPool]);

  // Amount change handler with total sync
  const handleAmountChange = useCallback((value: string) => {
    setActiveField('amount');
    onAmountChange(value);
    const amt = parseFloat(value) || 0;
    if (amt > 0 && effectivePrice > 0) {
      setTotalInput((amt * effectivePrice).toFixed(2));
    } else {
      setTotalInput('');
    }
  }, [onAmountChange, effectivePrice]);

  // Total change handler with amount reverse-calc (snapped to lot size)
  const handleTotalChange = useCallback((value: string) => {
    setActiveField('total');
    setTotalInput(value);
    const tot = parseFloat(value) || 0;
    if (tot > 0 && effectivePrice > 0) {
      const amt = snapToLot(tot / effectivePrice, currentPool);
      // Guard against astronomical values from tiny prices
      if (Number.isFinite(amt) && amt < 1e12) {
        onAmountChange(amt > 0 ? amt.toFixed(4) : '');
      }
    } else {
      onAmountChange('');
    }
  }, [onAmountChange, effectivePrice, currentPool]);

  // Sync total↔amount when price changes (useEffect, not useMemo)
  const prevPriceRef = useRef(effectivePrice);
  useEffect(() => {
    // Only run when effectivePrice actually changes
    if (prevPriceRef.current === effectivePrice) return;
    prevPriceRef.current = effectivePrice;

    if (activeField === 'amount' && amountNum > 0 && effectivePrice > 0) {
      setTotalInput((amountNum * effectivePrice).toFixed(2));
    } else if (activeField === 'total') {
      const tot = parseFloat(totalInput) || 0;
      if (tot > 0 && effectivePrice > 0) {
        const amt = snapToLot(tot / effectivePrice, currentPool);
        if (Number.isFinite(amt) && amt < 1e12) {
          onAmountChange(amt > 0 ? amt.toFixed(4) : '');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePrice]);

  // Percentage amount buttons (buy side reserves fee from available balance)
  const handlePercentAmount = useCallback((pct: number) => {
    setActiveField('amount');
    if (isBuy) {
      if (effectivePrice <= 0) return;
      // Reserve fee: usable = balance / (1 + feeRate) so total + fee <= balance
      const usableQuote = availableQuote / (1 + feeRate);
      const baseAmount = snapToLot((usableQuote * pct / 100) / effectivePrice, currentPool);
      const newAmount = baseAmount > 0 ? baseAmount.toFixed(4) : '';
      onAmountChange(newAmount);
      if (baseAmount > 0) setTotalInput((baseAmount * effectivePrice).toFixed(2));
    } else {
      const baseAmount = snapToLot(availableBase * pct / 100, currentPool);
      const newAmount = baseAmount > 0 ? baseAmount.toFixed(4) : '';
      onAmountChange(newAmount);
      if (baseAmount > 0 && effectivePrice > 0) setTotalInput((baseAmount * effectivePrice).toFixed(2));
    }
  }, [isBuy, effectivePrice, availableQuote, availableBase, onAmountChange, feeRate, currentPool]);

  // Keyboard shortcut: percentage amount (1-9 = 10%-90%, 0 = 100%)
  useEffect(() => {
    const handler = (e: Event) => {
      const raw = (e as CustomEvent).detail;
      const pct = Math.max(0, Math.min(100, Number(raw) || 0));
      if (pct <= 0) return;
      handlePercentAmount(pct);
    };
    document.addEventListener(SHORTCUT_PERCENT_EVENT, handler);
    return () => document.removeEventListener(SHORTCUT_PERCENT_EVENT, handler);
  }, [handlePercentAmount]);

  // Keyboard shortcut: price tick step (+/- keys)
  useEffect(() => {
    const handler = (e: Event) => {
      const direction = (e as CustomEvent).detail;
      if (direction !== 'up' && direction !== 'down') return;
      const currentPrice = parseFloat(price) || 0;
      const tick = getMinPrice(currentPool);
      const newPrice = direction === 'up'
        ? currentPrice + tick
        : Math.max(tick, currentPrice - tick);
      onPriceChange(snapToTick(newPrice, currentPool).toString());
    };
    document.addEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);
    return () => document.removeEventListener(SHORTCUT_PRICE_STEP_EVENT, handler);
  }, [price, currentPool, onPriceChange]);

  // Current amount as percentage of max (for slider)
  const currentPct = useMemo(() => {
    if (isBuy) {
      if (effectivePrice <= 0 || availableQuote <= 0) return 0;
      const usableQuote = availableQuote / (1 + feeRate);
      const maxBase = usableQuote / effectivePrice;
      return maxBase > 0 ? Math.min(100, Math.round((amountNum / maxBase) * 100)) : 0;
    } else {
      return availableBase > 0 ? Math.min(100, Math.round((amountNum / availableBase) * 100)) : 0;
    }
  }, [isBuy, effectivePrice, availableQuote, availableBase, amountNum, feeRate]);

  // Reset impact acknowledgment when inputs or order mode change
  useEffect(() => { setImpactAcked(false); }, [amount, side, orderMode]);

  // Price impact for market orders (VWAP calculation from orderbook depth)
  const priceImpact = useMemo(() => {
    if (!isMarket || amountNum <= 0 || !Number.isFinite(midPrice) || (midPrice ?? 0) <= 0) {
      return { avgPrice: 0, impactPct: 0, fillable: true, filledQty: 0 };
    }
    // Buy consumes asks (ascending price), sell consumes bids (descending price)
    const levels = isBuy ? asks : bids;
    if (levels.length === 0) {
      return { avgPrice: 0, impactPct: 0, fillable: false, filledQty: 0 };
    }
    let remaining = amountNum;
    let totalCost = 0;
    let filledQty = 0;
    for (const level of levels) {
      if (remaining <= 0) break;
      const fill = Math.min(remaining, level.quantity);
      totalCost += fill * level.price;
      filledQty += fill;
      remaining -= fill;
    }
    const mid = midPrice ?? 0;
    const avgPrice = filledQty > 0 ? totalCost / filledQty : 0;
    const impactPct = mid > 0 && avgPrice > 0
      ? Math.abs(avgPrice - mid) / mid * 100
      : 0;
    return { avgPrice, impactPct, fillable: remaining <= 0, filledQty };
  }, [isMarket, amountNum, midPrice, isBuy, asks, bids]);

  const stopPriceNum = parseFloat(stopPrice) || 0;
  const trailValueNum = parseFloat(trailValue) || 0;
  const hasValidationError = !quantityValidation.valid || (!isMarket && !isTrailingStop && !priceValidation.valid);
  const stopLimitMissingFields = isStopLimit && (stopPriceNum <= 0 || effectivePrice <= 0 || amountNum <= 0);
  const stopLimitPriceInvalid = isStopLimit && effectivePrice > 0 && !priceValidation.valid;
  const trailingStopMissing = isTrailingStop && (trailValueNum <= 0 || amountNum <= 0);
  const trailingStopInvalid = isTrailingStop && trailMode === 'percent' && trailValueNum > 50;
  const requiresImpactAck = isMarket && priceImpact.impactPct >= PRICE_IMPACT_CONFIRM_THRESHOLD;
  const isButtonDisabled = isMarket
    ? disabled || !amount || isLoading || isAutoDepositing || !quantityValidation.valid || (requiresImpactAck && !impactAcked)
    : isStopLimit
      ? disabled || isLoading || isAutoDepositing || stopLimitMissingFields || !quantityValidation.valid || stopLimitPriceInvalid
      : isTrailingStop
        ? disabled || isLoading || isAutoDepositing || trailingStopMissing || trailingStopInvalid || !quantityValidation.valid
        : disabled || isLoading || isAutoDepositing || hasValidationError;

  // Keyboard shortcut: submit order (Enter key)
  useEffect(() => {
    const handler = () => {
      if (!isButtonDisabled && !isInsufficient) {
        handleSubmit();
      }
    };
    document.addEventListener(SHORTCUT_SUBMIT_EVENT, handler);
    return () => document.removeEventListener(SHORTCUT_SUBMIT_EVENT, handler);
  }, [isButtonDisabled, isInsufficient, handleSubmit]);

  return (
    <div className="space-y-2 flex-1 flex flex-col">
      {/* A. Underline Tabs: Limit / Market / Stop-Limit */}
      <UnderlineTabs
        tabs={[
          { id: 'limit' as const, label: 'Limit' },
          { id: 'market' as const, label: 'Market' },
          { id: 'stop-limit' as const, label: 'Stop' },
          { id: 'trailing-stop' as const, label: 'Trail' },
          { id: 'scale' as const, label: 'Scale' },
        ]}
        activeTab={orderMode}
        onTabChange={setOrderMode}
        rightContent={
          !isMarket && !isStopLimit && !isTrailingStop && !isScale && executionOption !== 'GTC' ? (
            <span className="px-1.5 py-0.5 text-trading-xs xl:text-trading-sm bg-pd1/30 text-pd3 rounded">
              {executionOption}
            </span>
          ) : undefined
        }
      />

      {/* B. Buy/Sell Side Toggle */}
      <div className="grid grid-cols-2">
        <button
          onClick={() => { onSideChange('buy'); setActiveField('amount'); setTotalInput(''); }}
          className={`py-1.5 text-trading-sm xl:text-trading-lg font-semibold transition-colors rounded-l ${
            isBuy
              ? 'bg-green-600/15 text-green-700 dark:bg-green-500/15 dark:text-green-400 border-b-2 border-green-600 dark:border-green-400'
              : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary border-b-2 border-transparent'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => { onSideChange('sell'); setActiveField('amount'); setTotalInput(''); }}
          className={`py-1.5 text-trading-sm xl:text-trading-lg font-semibold transition-colors rounded-r ${
            !isBuy
              ? 'bg-red-600/15 text-red-700 dark:bg-red-500/15 dark:text-red-400 border-b-2 border-red-600 dark:border-red-400'
              : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary border-b-2 border-transparent'
          }`}
        >
          Sell
        </button>
      </div>

      {isScale ? (
        <ScaleOrderForm
          side={side}
          availableQuote={availableQuote}
          availableBase={availableBase}
          midPrice={midPrice || 0}
          feeRate={feeRate}
          onSubmit={onScaleOrder || (() => {})}
          disabled={disabled}
          isLoading={isLoading}
        />
      ) : (
      <>
      {/* C. Available Balance + In Orders */}
      <div className="text-trading-xs xl:text-trading-sm space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-theme-text-muted">Available</span>
          <button
            type="button"
            onClick={() => handlePercentAmount(100)}
            disabled={isBuy && effectivePrice <= 0}
            className={`font-mono transition-colors ${
              isBuy && effectivePrice <= 0
                ? 'text-theme-text-muted cursor-not-allowed'
                : 'text-theme-text-secondary hover:text-pd3 hover:underline cursor-pointer'
            }`}
            title={isBuy && effectivePrice <= 0 ? 'Set a price first' : 'Click to use max balance'}
          >
            {isBuy
              ? `${availableQuote.toFixed(2)} ${quoteSymbol}`
              : `${availableBase.toFixed(4)} ${baseSymbol}`}
          </button>
        </div>
        {((isBuy && lockedQuote > 0) || (!isBuy && lockedBase > 0)) && (
          <div className="flex items-center justify-between">
            <span className="text-theme-text-muted">In Orders</span>
            <span className="font-mono text-theme-text-muted">
              {isBuy
                ? `${lockedQuote.toFixed(2)} ${quoteSymbol}`
                : `${lockedBase.toFixed(4)} ${baseSymbol}`}
            </span>
          </div>
        )}
      </div>

      {/* D. Price Input (Limit / Market / Stop-Limit / Trailing-Stop) */}
      {isTrailingStop ? (
        <>
          {/* Trail Mode Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-trading-xs xl:text-trading-sm text-amber-400 font-medium">Trail</label>
              <div className="flex items-center bg-theme-bg-tertiary rounded overflow-hidden">
                <button
                  onClick={() => setTrailMode('percent')}
                  className={`px-2 py-0.5 text-trading-xs font-medium transition-colors ${
                    trailMode === 'percent'
                      ? 'bg-pd1/30 text-pd3'
                      : 'text-theme-text-muted hover:text-theme-text-secondary'
                  }`}
                >
                  %
                </button>
                <button
                  onClick={() => setTrailMode('amount')}
                  className={`px-2 py-0.5 text-trading-xs font-medium transition-colors ${
                    trailMode === 'amount'
                      ? 'bg-pd1/30 text-pd3'
                      : 'text-theme-text-muted hover:text-theme-text-secondary'
                  }`}
                >
                  $
                </button>
              </div>
            </div>
            <NumberInput
              placeholder={trailMode === 'percent' ? 'e.g. 2.0' : 'e.g. 500'}
              value={trailValue}
              onChange={(e) => setTrailValue(e.target.value)}
              step={trailMode === 'percent' ? 0.1 : 1}
              className="px-3 py-2 text-sm xl:text-base"
            />
            <p className="text-trading-xs text-theme-text-muted mt-0.5">
              {isBuy
                ? `Triggers buy when price rises ${trailMode === 'percent' ? '%' : '$'} above lowest point`
                : `Triggers sell when price drops ${trailMode === 'percent' ? '%' : '$'} from highest point`}
            </p>
          </div>
          {/* Current mid price display */}
          {midPrice && midPrice > 0 && (
            <div className="flex items-center justify-between text-trading-xs xl:text-trading-sm py-2 px-3 bg-theme-bg-tertiary/50 rounded">
              <span className="text-theme-text-muted">Current Price</span>
              <span className="text-green-400 font-mono">
                ${midPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </>
      ) : isStopLimit ? (
        <>
          {/* Stop Price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-trading-xs xl:text-trading-sm text-amber-400 font-medium">Stop Price ({quoteSymbol})</label>
              <button
                onClick={() => { if (midPrice) setStopPrice(snapToTick(midPrice, currentPool).toString()); }}
                disabled={!midPrice}
                className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-theme-text-primary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Mid
              </button>
            </div>
            <NumberInput
              placeholder="Trigger price"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              onFocus={() => setFocusedPriceField('stopPrice')}
              step={minPrice}
              className="px-3 py-2 text-sm xl:text-base"
            />
            <p className="text-trading-xs text-theme-text-muted mt-0.5">
              {isBuy ? 'Triggers when price rises to this level' : 'Triggers when price falls to this level'}
            </p>
          </div>
          {/* Limit Price */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Limit Price ({quoteSymbol})</label>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePriceSelect(midPrice || 0)}
                  disabled={!midPrice}
                  className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-theme-text-primary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Mid
                </button>
                <button
                  onClick={() => handlePriceSelect(bestBid)}
                  disabled={!bestBid}
                  className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-trading-bid font-medium rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Bid
                </button>
                <button
                  onClick={() => handlePriceSelect(bestAsk)}
                  disabled={!bestAsk}
                  className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-trading-ask font-medium rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Ask
                </button>
              </div>
            </div>
            <NumberInput
              placeholder="0.00"
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              onFocus={() => setFocusedPriceField('price')}
              step={minPrice}
              className={`px-3 py-2 text-sm xl:text-base ${
                effectivePrice > 0 && !priceValidation.valid
                  ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
                  : ''
              }`}
            />
            {effectivePrice > 0 && !priceValidation.valid && (
              <p className="text-trading-xs xl:text-trading-sm text-yellow-400 mt-1">{priceValidation.message}</p>
            )}
          </div>
        </>
      ) : !isMarket ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Price ({quoteSymbol})</label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handlePriceSelect(midPrice || 0)}
                disabled={!midPrice}
                className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-theme-text-primary rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Current mid price"
              >
                Mid
              </button>
              <button
                onClick={() => handlePriceSelect(bestBid)}
                disabled={!bestBid}
                className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-trading-bid font-medium rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Best bid price"
              >
                Bid
              </button>
              <button
                onClick={() => handlePriceSelect(bestAsk)}
                disabled={!bestAsk}
                className="px-1.5 py-0.5 text-trading-xs bg-theme-bg-tertiary hover:bg-theme-bg-secondary text-trading-ask font-medium rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Best ask price"
              >
                Ask
              </button>
            </div>
          </div>
          <NumberInput
            placeholder="0.00"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            step={minPrice}
            className={`px-3 py-2 text-sm xl:text-base ${
              effectivePrice > 0 && !priceValidation.valid
                ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
                : ''
            }`}
          />
          {effectivePrice > 0 && !priceValidation.valid && (
            <p className="text-trading-xs xl:text-trading-sm text-yellow-400 mt-1">{priceValidation.message}</p>
          )}
        </div>
      ) : (
        <>
          {midPrice && midPrice > 0 && (
            <div className="flex items-center justify-between text-trading-xs xl:text-trading-sm py-2 px-3 bg-theme-bg-tertiary/50 rounded">
              <span className="text-theme-text-muted">Market Price</span>
              <span className="text-green-400 font-mono">
                ~${midPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          {onSlippageChange && (
            <SlippageSettings value={slippage} onChange={onSlippageChange} />
          )}
          {/* Price Impact (visible when amount is entered) */}
          {amountNum > 0 && priceImpact.avgPrice > 0 && (
            <div className="space-y-1 px-3 py-2 bg-theme-bg-tertiary/50 rounded text-trading-xs xl:text-trading-sm">
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Est. Avg Price</span>
                <span className="font-mono text-theme-text-secondary">
                  ${priceImpact.avgPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Price Impact</span>
                <span className={`font-mono font-medium ${getPriceImpactColorClass(priceImpact.impactPct)}`}>
                  {priceImpact.impactPct < 0.01 ? '<0.01' : priceImpact.impactPct.toFixed(2)}%
                </span>
              </div>
              {!priceImpact.fillable && (
                <p className="text-red-400 mt-1">
                  Insufficient liquidity — only {priceImpact.filledQty.toFixed(4)} fillable
                </p>
              )}
              {priceImpact.impactPct >= 2 && priceImpact.fillable && (
                <p className="text-amber-700 dark:text-yellow-400 mt-1">
                  High price impact. Consider reducing size or using a limit order.
                </p>
              )}
              {requiresImpactAck && (
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={impactAcked}
                    onChange={(e) => setImpactAcked(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-red-500/50 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-xs text-red-700 dark:text-red-400">I understand the price impact</span>
                </label>
              )}
            </div>
          )}
        </>
      )}

      {/* E. Amount Input + Percentage Buttons */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Amount ({baseSymbol})</label>
          <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Min {minQuantity}</span>
        </div>
        <NumberInput
          placeholder="0.0000"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          step={minQuantity}
          className={`px-3 py-2 text-sm xl:text-base ${
            amountNum > 0 && !quantityValidation.valid
              ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
              : ''
          }`}
        />
        {amountNum > 0 && !quantityValidation.valid && (
          <p className="text-trading-xs xl:text-trading-sm text-yellow-400 mt-1">{quantityValidation.message}</p>
        )}
        {/* Percentage buttons + slider */}
        <div className="flex gap-1 mt-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePercentAmount(pct)}
              className={`flex-1 min-h-[44px] md:min-h-0 md:py-1 text-trading-xs xl:text-trading-sm font-medium rounded transition-colors ${
                currentPct === pct
                  ? 'bg-pd1/20 text-pd3'
                  : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
              }`}
            >
              {pct}%
            </button>
          ))}
        </div>
        <input
          type="range"
          aria-label="Order size percentage"
          min={0}
          max={100}
          value={currentPct}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (val > 0) handlePercentAmount(val);
            else handleAmountChange('');
          }}
          className="w-full h-1.5 mt-1 appearance-none rounded-full bg-theme-bg-tertiary cursor-pointer accent-pd1 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pd3 [&::-webkit-slider-thumb]:appearance-none"
        />
      </div>

      {/* E2. Total Input (bidirectional with Amount) */}
      <div>
        <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Total ({quoteSymbol})</label>
        <NumberInput
          placeholder="0.00"
          value={totalInput}
          onChange={(e) => handleTotalChange(e.target.value)}
          step={0.01}
          className="px-3 py-2 text-sm xl:text-base mt-1"
        />
      </div>

      {/* E3. TP/SL Inputs (hidden in stop-limit / trailing-stop mode — they are their own conditional orders) */}
      {!isStopLimit && !isTrailingStop && (
        <TPSLInputs
          enabled={tpslEnabled}
          onToggle={setTpslEnabled}
          tpPrice={tpPrice}
          slPrice={slPriceValue}
          onTPChange={setTpPrice}
          onSLChange={setSlPrice}
          midPrice={midPrice || 0}
          side={side}
          minPriceTick={minPrice}
          ocoEnabled={ocoEnabled}
          onOcoToggle={setOcoEnabled}
        />
      )}

      {/* F. Info Rows */}
      <div className="space-y-1 pt-1 border-t border-theme-border">
        {total > 0 && (
          <>
            <div className="flex justify-between text-trading-xs xl:text-trading-sm">
              <span className="text-theme-text-muted">{isMarket ? 'Est. Value' : 'Order Value'}</span>
              <span className="font-mono text-theme-text-secondary">{total.toFixed(2)} {quoteSymbol}</span>
            </div>
            <div className="flex justify-between text-trading-xs xl:text-trading-sm">
              <span className="text-theme-text-muted">Est. Fee ({feeLabel} {feePercent})</span>
              <span className="font-mono text-theme-text-secondary">~{fee.toFixed(4)} {quoteSymbol}</span>
            </div>
          </>
        )}
        {isMarket && (
          <div className="flex justify-between text-trading-xs xl:text-trading-sm">
            <span className="text-theme-text-muted">Slippage</span>
            <span className="font-mono text-theme-text-secondary">{slippage}%</span>
          </div>
        )}
        {total > 0 && (
          <div className="flex justify-between text-sm xl:text-base font-semibold pt-1 border-t border-theme-border/50">
            <span className="text-theme-text-secondary">{isBuy ? 'You Pay' : 'You Receive'}</span>
            <span className={`font-mono ${isBuy ? 'text-theme-text-primary' : 'text-green-400'}`}>
              ~{isBuy ? (total + fee).toFixed(2) : (total - fee).toFixed(2)} {quoteSymbol}
            </span>
          </div>
        )}
        {/* Insufficient balance warning for active side only */}
        {isInsufficient && (
          <InsufficientBalancePrompt
            tokenSymbol={isBuy ? quoteSymbol : baseSymbol}
            requiredAmount={isBuy ? total + fee : amountNum}
            availableAmount={isBuy ? availableQuote : availableBase}
            decimals={isBuy ? currentPool.quoteToken.decimals : currentPool.baseToken.decimals}
          />
        )}
      </div>

      {/* G. Execution Options (Limit only — not applicable to Market, Stop-Limit, or Trailing-Stop) */}
      {!isMarket && !isStopLimit && !isTrailingStop && onExecutionOptionChange && (
        <div>
          <div className="text-trading-xs xl:text-trading-sm text-theme-text-muted mb-1.5">Execution</div>
          <div className="grid grid-cols-4 gap-1">
            {EXECUTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onExecutionOptionChange(opt.value)}
                className={`py-1 px-1.5 text-trading-xs xl:text-trading-sm font-medium rounded transition-colors ${
                  executionOption === opt.value
                    ? 'bg-pd1 text-white'
                    : 'bg-theme-bg-secondary text-theme-text-primary hover:bg-theme-bg-tertiary'
                }`}
                title={opt.description}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-trading-xs text-theme-text-muted">
            {EXECUTION_OPTIONS.find((o) => o.value === executionOption)?.description}
          </p>
        </div>
      )}

      {/* H. Single Action Button */}
      <button
        onClick={handleSubmit}
        className={`mt-auto w-full py-2.5 text-trading-sm xl:text-trading-lg font-semibold rounded-lg text-white shadow-sm hover:shadow-md transition-all duration-150 disabled:opacity-50 ${
          isBuy
            ? 'bg-gradient-to-b from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 active:from-green-700 active:to-green-800 dark:shadow-[inset_0_1px_0_rgba(134,243,183,0.2)]'
            : 'bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:from-red-700 active:to-red-800 dark:shadow-[inset_0_1px_0_rgba(252,165,165,0.2)]'
        }`}
        disabled={isButtonDisabled || isInsufficient}
      >
        {isAutoDepositing
          ? 'Depositing...'
          : isLoading
            ? '...'
            : `${isMarket ? 'Market ' : isStopLimit ? 'Stop-Limit ' : isTrailingStop ? 'Trail ' : ''}${isBuy ? 'Buy' : 'Sell'} ${baseSymbol}`}
      </button>
      </>
      )}
    </div>
  );
}
