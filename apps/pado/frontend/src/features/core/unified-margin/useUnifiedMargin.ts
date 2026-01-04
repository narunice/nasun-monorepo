/**
 * useUnifiedMargin
 *
 * Unified Margin v0 - Frontend integration layer
 *
 * Combines wallet balance + BalanceManager balance for seamless UX.
 * Users see one unified balance across all products.
 *
 * @version 0.1.0
 */

import { useMemo } from 'react';
import { useMultiBalance } from '@nasun/wallet';
import { useBalanceManagerBalance } from '../../trading/hooks/useBalanceManagerBalance';

export interface UnifiedMarginState {
  // Wallet balances (available for Predict/Earn/Wallet)
  walletNusdc: bigint;
  walletNbtc: bigint;
  walletNasun: bigint;

  // BalanceManager balances (locked for Trade)
  tradingNusdc: bigint;
  tradingNbtc: bigint;
  tradingNasun: bigint;

  // Combined totals
  totalNusdc: bigint;
  totalNbtc: bigint;
  totalNasun: bigint;

  // Formatted values (for display)
  formatted: {
    walletNusdc: number;
    walletNbtc: number;
    walletNasun: number;
    tradingNusdc: number;
    tradingNbtc: number;
    tradingNasun: number;
    totalNusdc: number;
    totalNbtc: number;
    totalNasun: number;
  };

  // Loading state
  isLoading: boolean;

  // BalanceManager status
  hasBalanceManager: boolean;
  balanceManagerId: string | null;
}

// Token decimals
const NUSDC_DECIMALS = 6;
const NBTC_DECIMALS = 8;
const NASUN_DECIMALS = 9;

/**
 * Unified Margin Hook
 *
 * Provides a single source of truth for all user balances.
 * Combines wallet balances with BalanceManager balances.
 */
export function useUnifiedMargin(): UnifiedMarginState {
  const { data: walletBalances, isLoading: walletLoading } = useMultiBalance();
  const { balance: bmBalance, isLoading: bmLoading, balanceManagerId } = useBalanceManagerBalance();

  const result = useMemo(() => {
    // Wallet balances
    const walletNasun = walletBalances?.native?.balance ?? 0n;
    const walletNbtc = walletBalances?.tokens?.NBTC?.balance ?? 0n;
    const walletNusdc = walletBalances?.tokens?.NUSDC?.balance ?? 0n;

    // BalanceManager balances (from useBalanceManagerBalance)
    // Note: bmBalance uses different pool structure, we need base/quote
    // For now, assume base=NBTC, quote=NUSDC for NBTC/NUSDC pool
    const tradingNbtc = BigInt(Math.round((bmBalance?.base ?? 0) * Math.pow(10, NBTC_DECIMALS)));
    const tradingNusdc = BigInt(Math.round((bmBalance?.quote ?? 0) * Math.pow(10, NUSDC_DECIMALS)));
    const tradingNasun = 0n; // NASUN not typically in BM

    // Combined totals
    const totalNusdc = walletNusdc + tradingNusdc;
    const totalNbtc = walletNbtc + tradingNbtc;
    const totalNasun = walletNasun + tradingNasun;

    // Format for display
    const toNumber = (value: bigint, decimals: number): number =>
      Number(value) / Math.pow(10, decimals);

    return {
      walletNusdc,
      walletNbtc,
      walletNasun,
      tradingNusdc,
      tradingNbtc,
      tradingNasun,
      totalNusdc,
      totalNbtc,
      totalNasun,
      formatted: {
        walletNusdc: toNumber(walletNusdc, NUSDC_DECIMALS),
        walletNbtc: toNumber(walletNbtc, NBTC_DECIMALS),
        walletNasun: toNumber(walletNasun, NASUN_DECIMALS),
        tradingNusdc: toNumber(tradingNusdc, NUSDC_DECIMALS),
        tradingNbtc: toNumber(tradingNbtc, NBTC_DECIMALS),
        tradingNasun: toNumber(tradingNasun, NASUN_DECIMALS),
        totalNusdc: toNumber(totalNusdc, NUSDC_DECIMALS),
        totalNbtc: toNumber(totalNbtc, NBTC_DECIMALS),
        totalNasun: toNumber(totalNasun, NASUN_DECIMALS),
      },
      isLoading: walletLoading || bmLoading,
      hasBalanceManager: !!balanceManagerId,
      balanceManagerId,
    };
  }, [walletBalances, bmBalance, walletLoading, bmLoading, balanceManagerId]);

  return result;
}
