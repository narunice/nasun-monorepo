import { useState, useMemo } from 'react';
import type { ExecutionOption } from '../context';
import { useMarket } from '../context/MarketContext';
import { SlippageSettings } from './SlippageSettings';
import { PriceSuggestions } from './PriceSuggestions';
import { validateQuantity, validatePrice, getMinQuantity, getMinPrice } from '../../../lib/deepbook';

export type OrderModeType = 'limit' | 'market';

interface OrderFormProps {
  price: string;
  amount: string;
  onPriceChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onBuy: () => void;
  onSell: () => void;
  onMarketBuy?: () => void;
  onMarketSell?: () => void;
  disabled: boolean;
  isLoading: boolean;
  /** P0-3: Auto deposit in progress - hard disable submit */
  isAutoDepositing?: boolean;
  midPrice?: number;
  bestBid?: number;
  bestAsk?: number;
  // Advanced Options (Limit)
  executionOption?: ExecutionOption;
  onExecutionOptionChange?: (option: ExecutionOption) => void;
  // Slippage (Market)
  slippage?: number;
  onSlippageChange?: (value: number) => void;
  // Balance info for hints and warnings (Phase 2)
  availableQuote?: number;
  availableBase?: number;
}

// Execution Option 설명
const EXECUTION_OPTIONS: { value: ExecutionOption; label: string; description: string }[] = [
  { value: 'GTC', label: 'GTC', description: 'Good-Til-Canceled' },
  { value: 'IOC', label: 'IOC', description: 'Immediate-Or-Cancel' },
  { value: 'FOK', label: 'FOK', description: 'Fill-Or-Kill' },
  { value: 'POST_ONLY', label: 'Post', description: 'Maker only' },
];

export function OrderForm({
  price,
  amount,
  onPriceChange,
  onAmountChange,
  onBuy,
  onSell,
  onMarketBuy,
  onMarketSell,
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
}: OrderFormProps) {
  const { currentPool } = useMarket();
  const baseSymbol = currentPool.baseToken.symbol;
  const quoteSymbol = currentPool.quoteToken.symbol;

  const [orderMode, setOrderMode] = useState<OrderModeType>('limit');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isMarket = orderMode === 'market';

  // For limit orders, use the entered price
  // For market orders, use mid price as estimate
  const effectivePrice = isMarket ? (midPrice || 0) : parseFloat(price) || 0;
  const amountNum = parseFloat(amount) || 0;
  const total = effectivePrice * amountNum;

  // Balance check for insufficient funds warning (Phase 2)
  const insufficientForBuy = total > 0 && total > availableQuote;
  const insufficientForSell = amountNum > 0 && amountNum > availableBase;

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

  const handleBuy = () => {
    if (isMarket && onMarketBuy) {
      onMarketBuy();
    } else {
      onBuy();
    }
  };

  const handleSell = () => {
    if (isMarket && onMarketSell) {
      onMarketSell();
    } else {
      onSell();
    }
  };

  // Determine if buttons should be disabled
  // Validation must pass for the button to be enabled
  // P0-3: Include isAutoDepositing for submit mutex (hard disable during deposit)
  const hasValidationError = !quantityValidation.valid || (!isMarket && !priceValidation.valid);
  const isButtonDisabled = isMarket
    ? disabled || !amount || isLoading || isAutoDepositing || !quantityValidation.valid
    : disabled || isLoading || isAutoDepositing || hasValidationError;

  return (
    <div className="space-y-4">
      {/* Order Type Tabs */}
      <div className="flex bg-theme-bg-tertiary rounded-lg p-1">
        <button
          onClick={() => setOrderMode('limit')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            orderMode === 'limit'
              ? 'bg-theme-bg-primary text-theme-text-primary shadow-sm'
              : 'text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderMode('market')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            orderMode === 'market'
              ? 'bg-theme-bg-primary text-theme-text-primary shadow-sm'
              : 'text-theme-text-secondary hover:text-theme-text-primary'
          }`}
        >
          Market
        </button>
      </div>

      {/* Price Input - Only for Limit orders */}
      {!isMarket && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-theme-text-secondary">Price ({quoteSymbol})</label>
            <span className="text-xs text-theme-text-muted">min: ${minPrice}</span>
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
            className={`w-full px-4 py-2 bg-theme-bg-tertiary rounded focus:outline-none focus:ring-2 ${
              effectivePrice > 0 && !priceValidation.valid
                ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
                : 'focus:ring-blue-500'
            }`}
          />
          {effectivePrice > 0 && !priceValidation.valid && (
            <p className="text-xs text-yellow-400 mt-1">{priceValidation.message}</p>
          )}
        </div>
      )}

      {/* Market Price Info */}
      {isMarket && midPrice && midPrice > 0 && (
        <div className="p-3 bg-theme-bg-tertiary/50 rounded text-sm">
          <div className="flex justify-between text-theme-text-secondary">
            <span>Market Price</span>
            <span className="text-green-400 font-mono">
              ~${midPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="text-xs text-theme-text-muted mt-1">
            Executes immediately at best available price
          </p>
        </div>
      )}

      {/* Slippage Settings - Market only */}
      {isMarket && onSlippageChange && (
        <SlippageSettings value={slippage} onChange={onSlippageChange} />
      )}

      {/* Amount Input */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm text-theme-text-secondary">Amount ({baseSymbol})</label>
          <span className="text-xs text-theme-text-muted">min: {minQuantity} {baseSymbol}</span>
        </div>
        <input
          type="number"
          placeholder="0.0000"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          className={`w-full px-4 py-2 bg-theme-bg-tertiary rounded focus:outline-none focus:ring-2 ${
            amountNum > 0 && !quantityValidation.valid
              ? 'ring-2 ring-yellow-500/50 focus:ring-yellow-500'
              : 'focus:ring-blue-500'
          }`}
        />
        {amountNum > 0 && !quantityValidation.valid && (
          <p className="text-xs text-yellow-400 mt-1">{quantityValidation.message}</p>
        )}
      </div>

      {/* Total Estimate */}
      {total > 0 && (
        <div className="text-sm text-theme-text-secondary">
          {isMarket ? 'Est. Total: ' : 'Total: '}
          <span className="font-mono">{total.toFixed(2)}</span> {quoteSymbol}
        </div>
      )}

      {/* Advanced Options Toggle - Limit only */}
      {!isMarket && onExecutionOptionChange && (
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-theme-text-secondary hover:text-theme-text-primary transition-colors"
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
              <span className="ml-1 px-1.5 py-0.5 bg-blue-600/30 text-blue-400 rounded text-[10px]">
                {executionOption}
              </span>
            )}
          </button>

          {showAdvanced && (
            <div className="mt-2 p-3 bg-theme-bg-tertiary/50 rounded">
              <div className="text-xs text-theme-text-secondary mb-2">Execution Option</div>
              <div className="grid grid-cols-4 gap-1">
                {EXECUTION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onExecutionOptionChange(opt.value)}
                    className={`py-1.5 px-2 text-xs font-medium rounded transition-colors ${
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
              <p className="mt-2 text-[10px] text-theme-text-muted">
                {EXECUTION_OPTIONS.find((o) => o.value === executionOption)?.description}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Balance Hints & Warnings (Phase 2) */}
      {total > 0 && (
        <div className="space-y-1">
          {/* Buy hint - shows required quote */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-theme-text-muted">Buy requires:</span>
            <span className={`font-mono ${insufficientForBuy ? 'text-red-400' : 'text-theme-text-secondary'}`}>
              {total.toFixed(2)} {quoteSymbol}
            </span>
          </div>
          {insufficientForBuy && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <span>⚠</span>
              <span>Insufficient {quoteSymbol} balance ({availableQuote.toFixed(2)} available)</span>
            </p>
          )}
        </div>
      )}

      {amountNum > 0 && (
        <div className="space-y-1">
          {/* Sell hint - shows required base */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-theme-text-muted">Sell requires:</span>
            <span className={`font-mono ${insufficientForSell ? 'text-red-400' : 'text-theme-text-secondary'}`}>
              {amountNum.toFixed(4)} {baseSymbol}
            </span>
          </div>
          {insufficientForSell && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <span>⚠</span>
              <span>Insufficient {baseSymbol} balance ({availableBase.toFixed(4)} available)</span>
            </p>
          )}
        </div>
      )}

      {/* Buy/Sell Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleBuy}
          className="py-2 bg-green-600 hover:bg-green-700 rounded font-medium disabled:opacity-50 transition-colors text-white"
          disabled={isButtonDisabled || insufficientForBuy}
        >
          {isAutoDepositing ? 'Depositing...' : isLoading ? '...' : `${isMarket ? 'Market ' : ''}Buy`}
        </button>
        <button
          onClick={handleSell}
          className="py-2 bg-red-600 hover:bg-red-700 rounded font-medium disabled:opacity-50 transition-colors text-white"
          disabled={isButtonDisabled || insufficientForSell}
        >
          {isAutoDepositing ? 'Depositing...' : isLoading ? '...' : `${isMarket ? 'Market ' : ''}Sell`}
        </button>
      </div>
    </div>
  );
}
