/**
 * useRiskEngine Hook
 *
 * Provides margin validation for Pado Balance trades.
 * Uses the risk-engine library functions with current margin account state.
 */

import { useCallback, useMemo } from 'react';
import { useMarginAccount } from './useMarginAccount';
import {
  validateTrade,
  canAfford,
  getRequiredMargin,
  getMarginShortfall,
  formatMarginError,
  formatRequiredMargin,
  toRawNusdc,
  fromRawNusdc,
} from '../../../lib/risk-engine';

export interface UseRiskEngineResult {
  /** Current margin balance (raw bigint) */
  currentMargin: bigint;

  /** Current margin balance (formatted number) */
  currentMarginFormatted: number;

  /** Check if can afford trade (simple check, no buffer) */
  canAffordTrade: (tradeValueNusdc: number) => boolean;

  /** Validate trade with 10% buffer requirement */
  canTrade: (tradeValueNusdc: number) => boolean;

  /** Get required margin for a trade (with buffer) */
  getRequired: (tradeValueNusdc: number) => number;

  /** Get margin shortfall (how much more needed) */
  getShortfall: (tradeValueNusdc: number) => number;

  /** Format error message for insufficient margin */
  formatError: (tradeValueNusdc: number) => string;

  /** Format required margin for display */
  formatRequired: (tradeValueNusdc: number) => string;

  /** Whether user has a margin account */
  hasMarginAccount: boolean;

  /** Whether margin data is loading */
  isLoading: boolean;
}

export function useRiskEngine(): UseRiskEngineResult {
  const { account: marginAccount, hasAccount: hasMarginAccount, isLoading } = useMarginAccount();

  // Current margin balance
  const currentMargin = useMemo(() => {
    if (!marginAccount?.nusdcBalance) return 0n;
    return BigInt(marginAccount.nusdcBalance);
  }, [marginAccount?.nusdcBalance]);

  const currentMarginFormatted = useMemo(() => {
    return fromRawNusdc(currentMargin);
  }, [currentMargin]);

  // Simple affordability check (no buffer)
  const canAffordTrade = useCallback(
    (tradeValueNusdc: number): boolean => {
      const tradeValueRaw = toRawNusdc(tradeValueNusdc);
      return canAfford(currentMargin, tradeValueRaw);
    },
    [currentMargin]
  );

  // Full validation with 10% buffer
  const canTrade = useCallback(
    (tradeValueNusdc: number): boolean => {
      const tradeValueRaw = toRawNusdc(tradeValueNusdc);
      return validateTrade(currentMargin, tradeValueRaw);
    },
    [currentMargin]
  );

  // Get required margin
  const getRequired = useCallback((tradeValueNusdc: number): number => {
    const tradeValueRaw = toRawNusdc(tradeValueNusdc);
    const required = getRequiredMargin(tradeValueRaw);
    return fromRawNusdc(required);
  }, []);

  // Get shortfall
  const getShortfall = useCallback(
    (tradeValueNusdc: number): number => {
      const tradeValueRaw = toRawNusdc(tradeValueNusdc);
      const shortfall = getMarginShortfall(currentMargin, tradeValueRaw);
      return fromRawNusdc(shortfall);
    },
    [currentMargin]
  );

  // Format error message
  const formatError = useCallback(
    (tradeValueNusdc: number): string => {
      const tradeValueRaw = toRawNusdc(tradeValueNusdc);
      return formatMarginError(currentMargin, tradeValueRaw);
    },
    [currentMargin]
  );

  // Format required margin
  const formatRequired = useCallback((tradeValueNusdc: number): string => {
    const tradeValueRaw = toRawNusdc(tradeValueNusdc);
    return formatRequiredMargin(tradeValueRaw);
  }, []);

  return {
    currentMargin,
    currentMarginFormatted,
    canAffordTrade,
    canTrade,
    getRequired,
    getShortfall,
    formatError,
    formatRequired,
    hasMarginAccount,
    isLoading,
  };
}
