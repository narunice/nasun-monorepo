/**
 * Perpetual Order Form Component
 * Long/Short position entry form
 */

import { useState, useCallback, useMemo } from 'react';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { LeverageSlider } from './LeverageSlider';
import { usePerpMarketContext } from '../context/PerpMarketContext';
import { usePerpOrder } from '../hooks/usePerpOrder';
import { useSubmitGuard } from '../../../hooks/useSubmitGuard';
import {
  POSITION_SIDE,
  DEFAULT_TAKER_FEE_BPS,
  MIN_POSITION_SIZE,
  PRICE_DECIMALS,
} from '../constants';
import type { PerpOrderFormState, OrderPreview } from '../types';

interface PerpOrderFormProps {
  onOrderSuccess?: (txDigest: string) => void;
  onOrderError?: (error: Error) => void;
}

export function PerpOrderForm({
  onOrderSuccess,
  onOrderError,
}: PerpOrderFormProps) {
  const { account, status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const {
    selectedMarketId,
    selectedMarket,
    currentPrice,
    isPriceStale,
  } = usePerpMarketContext();

  const [formState, setFormState] = useState<PerpOrderFormState>({
    side: POSITION_SIDE.LONG,
    size: '',
    leverage: 5,
    collateral: '',
  });

  const [availableBalance] = useState(0); // TODO: Fetch from wallet
  const { isSubmitting, guard: submitGuard } = useSubmitGuard();

  // Initialize order hook
  const { openPosition, isOpening, calculatePreview } = usePerpOrder({
    marketId: selectedMarketId || '',
    onSuccess: onOrderSuccess,
    onError: onOrderError,
  });

  // Calculate order preview
  const preview = useMemo<OrderPreview>(() => {
    const size = parseFloat(formState.size) || 0;

    if (!selectedMarket || size <= 0 || currentPrice <= 0) {
      return {
        entryPrice: currentPrice,
        notionalValue: 0,
        requiredMargin: 0,
        fee: 0,
        liquidationPrice: 0,
        maxSize: 0,
        errors: [],
      };
    }

    return calculatePreview({
      isLong: formState.side === POSITION_SIDE.LONG,
      size,
      leverage: formState.leverage,
      currentPrice,
      availableBalance,
      takerFeeBps: selectedMarket.takerFeeBps || DEFAULT_TAKER_FEE_BPS,
    });
  }, [
    formState,
    selectedMarket,
    currentPrice,
    availableBalance,
    calculatePreview,
  ]);

  // Handle side change
  const handleSideChange = useCallback(
    (side: typeof POSITION_SIDE.LONG | typeof POSITION_SIDE.SHORT) => {
      setFormState((prev) => ({ ...prev, side }));
    },
    [],
  );

  // Handle size change
  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '' || /^\d*\.?\d*$/.test(value)) {
        setFormState((prev) => ({ ...prev, size: value }));
      }
    },
    [],
  );

  // Handle leverage change
  const handleLeverageChange = useCallback((leverage: number) => {
    setFormState((prev) => ({ ...prev, leverage }));
  }, []);

  // Handle max size
  const handleMaxSize = useCallback(() => {
    if (preview.maxSize > 0) {
      setFormState((prev) => ({
        ...prev,
        size: preview.maxSize.toFixed(2),
      }));
    }
  }, [preview.maxSize]);

  // Handle submit with double-submission guard
  const handleSubmit = useCallback(async () => {
    if (!selectedMarketId || preview.errors.length > 0) return;

    const size = parseFloat(formState.size);
    if (isNaN(size) || size <= 0) return;

    await submitGuard(async () => {
      await openPosition({
        isLong: formState.side === POSITION_SIDE.LONG,
        size,
        leverage: formState.leverage,
        currentPrice,
      });

      // Reset form on success
      setFormState((prev) => ({
        ...prev,
        size: '',
        collateral: '',
      }));
    });
  }, [selectedMarketId, formState, currentPrice, openPosition, preview.errors, submitGuard]);

  const isLong = formState.side === POSITION_SIDE.LONG;
  const isWalletConnected = (status === 'unlocked' && !!account?.address) || isZkLoggedIn || isPasskeyUnlocked;
  const isDisabled =
    !isWalletConnected ||
    !selectedMarketId ||
    isPriceStale ||
    preview.errors.length > 0 ||
    parseFloat(formState.size) <= 0;

  const minSizeUsd = (MIN_POSITION_SIZE / PRICE_DECIMALS) * currentPrice;

  return (
    <div className="space-y-4">
      {/* Side Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleSideChange(POSITION_SIDE.LONG)}
          className={`py-3 text-sm font-bold rounded transition-colors ${
            isLong
              ? 'bg-green-600/15 text-green-700 dark:bg-green-500/15 dark:text-green-400'
              : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
          }`}
        >
          Long
        </button>
        <button
          onClick={() => handleSideChange(POSITION_SIDE.SHORT)}
          className={`py-3 text-sm font-bold rounded transition-colors ${
            !isLong
              ? 'bg-red-600/15 text-red-700 dark:bg-red-500/15 dark:text-red-400'
              : 'bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary'
          }`}
        >
          Short
        </button>
      </div>

      {/* Size Input */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-theme-text-secondary">
            Size (USD)
          </label>
          <button
            onClick={handleMaxSize}
            className="text-xs text-theme-primary hover:underline"
          >
            Max: ${preview.maxSize.toFixed(2)}
          </button>
        </div>
        <div className="relative">
          <input
            type="text"
            value={formState.size}
            onChange={handleSizeChange}
            placeholder="0.00"
            className="w-full px-4 py-3 text-lg font-medium bg-theme-bg-secondary border border-theme-border rounded focus:outline-none focus:border-theme-primary"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-theme-text-muted">
            USD
          </span>
        </div>
        {minSizeUsd > 0 && (
          <p className="text-xs text-theme-text-muted">
            Min: ${minSizeUsd.toFixed(2)}
          </p>
        )}
      </div>

      {/* Leverage Slider */}
      <LeverageSlider
        value={formState.leverage}
        onChange={handleLeverageChange}
        maxLeverage={selectedMarket?.maxLeverage || 20}
      />

      {/* Order Preview */}
      <div className="p-3 bg-theme-bg-secondary rounded space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Entry Price</span>
          <span className="font-medium">
            ${currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Notional Value</span>
          <span className="font-medium">
            ${preview.notionalValue.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Required Margin</span>
          <span className="font-medium">
            ${preview.requiredMargin.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-theme-text-muted">Fee (0.05%)</span>
          <span className="font-medium">${preview.fee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between border-t border-theme-border pt-2 mt-2">
          <span className="text-theme-text-muted">Liq. Price</span>
          <span
            className={`font-medium ${
              isLong ? 'text-red-400' : 'text-green-400'
            }`}
          >
            ${preview.liquidationPrice.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Errors */}
      {preview.errors.length > 0 && (
        <div className="p-3 bg-red-500/25 border border-red-500/50 rounded">
          {preview.errors.map((error, i) => (
            <p key={i} className="text-sm text-red-400">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Price Stale Warning */}
      {isPriceStale && (
        <div className="p-3 bg-yellow-500/25 border border-yellow-500/50 rounded">
          <p className="text-sm text-yellow-400">
            Oracle price is stale. Please wait for fresh price data.
          </p>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isDisabled || isOpening || isSubmitting}
        className={`w-full py-4 text-lg font-bold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isLong
            ? 'bg-green-500 hover:bg-green-600 text-white'
            : 'bg-red-500 hover:bg-red-600 text-white'
        }`}
      >
        {isOpening ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Opening...
          </span>
        ) : !isWalletConnected ? (
          'Connect Wallet'
        ) : (
          `${isLong ? 'Long' : 'Short'} ${formState.leverage}x`
        )}
      </button>
    </div>
  );
}
