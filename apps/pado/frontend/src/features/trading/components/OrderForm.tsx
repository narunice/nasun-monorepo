import { useState, useMemo, useCallback } from 'react';
import type { ExecutionOption } from '../context';
import { useMarket } from '../context/MarketContext';
import { UnderlineTabs } from '@/components/common';
import { SlippageSettings } from './SlippageSettings';
import { PriceSuggestions } from './PriceSuggestions';
import { InsufficientBalancePrompt } from './InsufficientBalancePrompt';
import { validateQuantity, validatePrice, getMinQuantity, getMinPrice } from '../../../lib/deepbook';

export type OrderModeType = 'limit' | 'market';

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
  side: 'buy' | 'sell';
  onSideChange: (side: 'buy' | 'sell') => void;
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
  side,
  onSideChange,
}: OrderFormProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  const [orderMode, setOrderMode] = useState<OrderModeType>('limit');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isMarket = orderMode === 'market';
  const isBuy = side === 'buy';

  const effectivePrice = isMarket ? (midPrice || 0) : parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = effectivePrice * amountNum;

  // Balance check for the active side only
  const insufficientForBuy = total > 0 && total > availableQuote;
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

  const handleSubmit = () => {
    if (isMarket) {
      onMarketOrder(side);
    } else {
      onOrder(side);
    }
  };

  // Percentage amount buttons
  const handlePercentAmount = useCallback((pct: number) => {
    if (isBuy) {
      if (effectivePrice <= 0) return;
      const baseAmount = (availableQuote * pct / 100) / effectivePrice;
      onAmountChange(baseAmount > 0 ? baseAmount.toFixed(4) : '');
    } else {
      const baseAmount = availableBase * pct / 100;
      onAmountChange(baseAmount > 0 ? baseAmount.toFixed(4) : '');
    }
  }, [isBuy, effectivePrice, availableQuote, availableBase, onAmountChange]);

  const hasValidationError = !quantityValidation.valid || (!isMarket && !priceValidation.valid);
  const isButtonDisabled = isMarket
    ? disabled || !amount || isLoading || isAutoDepositing || !quantityValidation.valid
    : disabled || isLoading || isAutoDepositing || hasValidationError;

  return (
    <div className="space-y-3">
      {/* A. Underline Tabs: Limit / Market */}
      <UnderlineTabs
        tabs={[
          { id: 'limit' as const, label: 'Limit' },
          { id: 'market' as const, label: 'Market' },
        ]}
        activeTab={orderMode}
        onTabChange={setOrderMode}
        rightContent={
          !isMarket && executionOption !== 'GTC' ? (
            <span className="px-1.5 py-0.5 text-trading-xs xl:text-trading-sm bg-blue-600/30 text-blue-400 rounded">
              {executionOption}
            </span>
          ) : undefined
        }
      />

      {/* B. Buy/Sell Side Toggle */}
      <div className="grid grid-cols-2">
        <button
          onClick={() => onSideChange('buy')}
          className={`py-2 text-sm xl:text-base font-semibold transition-colors rounded-l ${
            isBuy
              ? 'bg-green-600/15 text-green-700 dark:bg-green-500/15 dark:text-green-400'
              : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => onSideChange('sell')}
          className={`py-2 text-sm xl:text-base font-semibold transition-colors rounded-r ${
            !isBuy
              ? 'bg-red-600/15 text-red-700 dark:bg-red-500/15 dark:text-red-400'
              : 'bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          Sell
        </button>
      </div>

      {/* C. Available Balance */}
      <div className="flex items-center justify-between text-trading-xs xl:text-trading-sm">
        <span className="text-theme-text-muted">Available</span>
        <span className="font-mono text-theme-text-secondary">
          {isBuy
            ? `${availableQuote.toFixed(2)} ${quoteSymbol}`
            : `${availableBase.toFixed(4)} ${baseSymbol}`}
        </span>
      </div>

      {/* D. Price Input (Limit) or Market Price Info */}
      {!isMarket ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Price ({quoteSymbol})</label>
            <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Min ${minPrice}</span>
          </div>
          <PriceSuggestions
            midPrice={midPrice || 0}
            bestBid={bestBid}
            bestAsk={bestAsk}
            onSelect={(p) => onPriceChange(p.toString())}
          />
          <input
            type="number"
            placeholder="0.00"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            className={`w-full px-3 py-2 text-sm xl:text-base bg-theme-bg-tertiary rounded focus:outline-none focus:ring-2 ${
              effectivePrice > 0 && !priceValidation.valid
                ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
                : 'focus:ring-blue-500'
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
        </>
      )}

      {/* E. Amount Input + Percentage Buttons */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Amount ({baseSymbol})</label>
          <span className="text-trading-xs xl:text-trading-sm text-theme-text-muted">Min {minQuantity}</span>
        </div>
        <input
          type="number"
          placeholder="0.0000"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className={`w-full px-3 py-2 text-sm xl:text-base bg-theme-bg-tertiary rounded focus:outline-none focus:ring-2 ${
            amountNum > 0 && !quantityValidation.valid
              ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
              : 'focus:ring-blue-500'
          }`}
        />
        {amountNum > 0 && !quantityValidation.valid && (
          <p className="text-trading-xs xl:text-trading-sm text-yellow-400 mt-1">{quantityValidation.message}</p>
        )}
        {/* Percentage buttons */}
        <div className="flex gap-1 mt-1.5">
          {[25, 50, 75, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => handlePercentAmount(pct)}
              className="flex-1 py-1 text-trading-xs xl:text-trading-sm font-medium rounded bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              {pct}%
            </button>
          ))}
        </div>
      </div>

      {/* F. Info Rows */}
      <div className="space-y-1 pt-1 border-t border-theme-border">
        {total > 0 && (
          <div className="flex justify-between text-trading-xs xl:text-trading-sm">
            <span className="text-theme-text-muted">{isMarket ? 'Est. Value' : 'Order Value'}</span>
            <span className="font-mono text-theme-text-secondary">{total.toFixed(2)} {quoteSymbol}</span>
          </div>
        )}
        {isMarket && (
          <div className="flex justify-between text-trading-xs xl:text-trading-sm">
            <span className="text-theme-text-muted">Slippage</span>
            <span className="font-mono text-theme-text-secondary">{slippage}%</span>
          </div>
        )}
        {/* Insufficient balance warning for active side only */}
        {isInsufficient && (
          <InsufficientBalancePrompt
            tokenSymbol={isBuy ? quoteSymbol : baseSymbol}
            requiredAmount={isBuy ? total : amountNum}
            availableAmount={isBuy ? availableQuote : availableBase}
          />
        )}
      </div>

      {/* G. Advanced Options (Limit only) */}
      {!isMarket && onExecutionOptionChange && (
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-trading-xs xl:text-trading-sm text-theme-text-muted hover:text-theme-text-primary transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Advanced
            {executionOption !== 'GTC' && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600/30 text-blue-400 rounded text-[10px] xl:text-xs">
                {executionOption}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-2 p-2 bg-theme-bg-tertiary/50 rounded">
              <div className="text-trading-xs xl:text-trading-sm text-theme-text-muted mb-1.5">Execution</div>
              <div className="grid grid-cols-4 gap-1">
                {EXECUTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onExecutionOptionChange(opt.value)}
                    className={`py-1 px-1.5 text-trading-xs xl:text-trading-sm font-medium rounded transition-colors ${
                      executionOption === opt.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-theme-bg-secondary text-theme-text-primary hover:bg-theme-bg-tertiary'
                    }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] xl:text-xs text-theme-text-muted">
                {EXECUTION_OPTIONS.find((o) => o.value === executionOption)?.description}
              </p>
            </div>
          )}
        </div>
      )}

      {/* H. Single Action Button */}
      <button
        onClick={handleSubmit}
        className={`w-full py-2.5 font-semibold rounded transition-colors text-white disabled:opacity-50 ${
          isBuy
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-red-600 hover:bg-red-700'
        }`}
        disabled={isButtonDisabled || isInsufficient}
      >
        {isAutoDepositing
          ? 'Depositing...'
          : isLoading
            ? '...'
            : `${isMarket ? 'Market ' : ''}${isBuy ? 'Buy' : 'Sell'} ${baseSymbol}`}
      </button>
    </div>
  );
}
