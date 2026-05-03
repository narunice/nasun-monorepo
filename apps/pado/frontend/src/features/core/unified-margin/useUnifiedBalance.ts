/**
 * useUnifiedBalance
 *
 * Unified balance hook that aggregates all cash-equivalent assets:
 * - Wallet coins (NASUN, NBTC, NUSDC)
 * - BalanceManager balance (DeepBook trading)
 * - MarginAccount balance (Pado Balance)
 *
 * IMPORTANT: This hook only tracks "cash-equivalent" assets.
 * It does NOT include:
 * - Prediction positions (unrealized PnL)
 * - Open orders (locked but not settled)
 * - Future: Perp unrealized PnL, lending deposits
 *
 * For total portfolio value including positions, use useTotalValue or useNetWorth.
 *
 * @version 1.0.0 (Phase 16.1)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultiBalance, useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { useMarginAccount } from './useMarginAccount';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { getStoredBalanceManagerId, floatToRaw } from '../../../lib/unified-margin';
import { POOLS, TOKENS, getTokenBySymbol } from '../../../config/network';
import {
  type TokenSymbol,
  getUnifiedPrice,
  calculateUsdValue,
  getPriceChange24h,
  calculate24hPnl,
} from '../../../lib/prices';

/**
 * Token breakdown with source tracking
 */
export interface TokenBreakdown {
  /** Raw wallet balance in smallest unit */
  wallet: bigint;
  /** Raw trading balance (BalanceManager) in smallest unit - NBTC/NUSDC only */
  trading: bigint;
  /** Raw margin balance (MarginAccount) in smallest unit - NUSDC only */
  margin: bigint;
  /** Total amount in human-readable format */
  total: number;
  /** Total USD value */
  usd: number;
  /** 24h price change percentage */
  change24h: number;
  /** 24h PnL in USD */
  pnl24h: number;
}

/**
 * Unified balance state
 */
export interface UnifiedBalanceState {
  // Totals (USD) - cash-only assets
  /** Total value across all sources */
  totalValue: number;
  /** Available for immediate use (wallet + margin - inOpenOrders) */
  available: number;
  /** In BalanceManager (trading account) */
  inTrading: number;
  /** In MarginAccount (Pado Balance) */
  inMargin: number;
  /** Combined BM + MA in USD — the user-facing "single pocket" total */
  inPado: number;
  /** Locked in open orders (estimated) */
  inOpenOrders: number;

  // 24h changes
  /** Total 24h PnL in USD */
  totalPnl24h: number;
  /** Total 24h change percentage */
  totalChange24h: number;

  // Token breakdown (extends as new markets are added)
  breakdown: Partial<Record<TokenSymbol, TokenBreakdown>>;

  // Future-ready fields (v1 preparation)
  /** Margin usage percentage (0-100) - reserved for v1 */
  marginUsagePercent?: number;
  /** Free collateral in USD - reserved for v1 */
  freeCollateral?: number;

  // Status flags
  isLoading: boolean;
  hasBalanceManager: boolean;
  hasMarginAccount: boolean;

  // Error state
  error: Error | null;

  // Actions
  refetch: () => void;
}

/**
 * Hook to get unified balance across all sources
 *
 * @example
 * const { totalValue, breakdown, isLoading } = useUnifiedBalance();
 *
 * // Display total value
 * <div>${totalValue.toLocaleString()}</div>
 *
 * // Access NBTC breakdown
 * const { wallet, trading, usd } = breakdown.NBTC;
 */
export function useUnifiedBalance(): UnifiedBalanceState {
  const adaptiveInterval = useAdaptiveInterval(10_000);
  // Get active wallet address
  const { account: walletAccount, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const activeAddress = isZkLoggedIn ? zkState?.address : (status === 'unlocked' ? walletAccount?.address : (isPasskeyUnlocked ? passkeyAddress ?? undefined : undefined));

  // Wallet balances
  const {
    data: walletBalance,
    isLoading: isWalletLoading,
    refetch: refetchWallet,
  } = useMultiBalance();

  // Margin account
  const {
    account: marginAccount,
    hasAccount: hasMarginAccount,
    isLoading: isMarginLoading,
    refetch: refetchMargin,
    error: marginError,
  } = useMarginAccount();

  // BalanceManager balances (DeepBook trading)
  // IMPORTANT: Use address-keyed storage to support multi-wallet
  const balanceManagerId = activeAddress ? getStoredBalanceManagerId(activeAddress) : null;
  const {
    data: bmBalance,
    isLoading: isBmLoading,
    refetch: refetchBm,
  } = useQuery({
    queryKey: ['bm-balance-global', balanceManagerId],
    queryFn: async () => {
      if (!balanceManagerId) return { base: 0, quote: 0 };
      try {
        return await getBalanceManagerBalances(balanceManagerId, POOLS.NBTC_NUSDC);
      } catch {
        return { base: 0, quote: 0 };
      }
    },
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
    enabled: !!balanceManagerId,
  });

  const hasBalanceManager = !!balanceManagerId;
  const isLoading = isWalletLoading || isMarginLoading || isBmLoading;

  // Refetch all sources
  const refetch = () => {
    refetchWallet();
    refetchMargin();
    if (balanceManagerId) {
      refetchBm();
    }
  };

  const result = useMemo<Omit<UnifiedBalanceState, 'isLoading' | 'hasBalanceManager' | 'hasMarginAccount' | 'error' | 'refetch'>>(() => {
    // Parse wallet balances
    const nasunWallet = walletBalance?.native?.balance ?? 0n;
    const nbtcWallet = walletBalance?.tokens?.['NBTC']?.balance ?? 0n;
    const nusdcWallet = walletBalance?.tokens?.['NUSDC']?.balance ?? 0n;

    // Parse trading balances (BalanceManager)
    const nbtcTrading = floatToRaw(bmBalance?.base ?? 0, TOKENS.NBTC.decimals);
    const nusdcTrading = floatToRaw(bmBalance?.quote ?? 0, TOKENS.NUSDC.decimals);

    // Parse margin balance (MarginAccount - NUSDC only)
    const nusdcMargin = marginAccount?.nusdcBalance
      ? BigInt(marginAccount.nusdcBalance)
      : 0n;

    // Calculate human-readable totals
    const nasunTotal = Number(nasunWallet) / 10 ** TOKENS.NASUN.decimals;
    const nbtcTotal =
      Number(nbtcWallet) / 10 ** TOKENS.NBTC.decimals +
      Number(nbtcTrading) / 10 ** TOKENS.NBTC.decimals;
    const nusdcTotal =
      Number(nusdcWallet) / 10 ** TOKENS.NUSDC.decimals +
      Number(nusdcTrading) / 10 ** TOKENS.NUSDC.decimals +
      Number(nusdcMargin) / 10 ** TOKENS.NUSDC.decimals;

    // Calculate USD values using unified prices
    const nasunUsd = calculateUsdValue('NSN', nasunTotal);
    const nbtcUsd = calculateUsdValue('NBTC', nbtcTotal);
    const nusdcUsd = calculateUsdValue('NUSDC', nusdcTotal);

    // Calculate 24h PnL
    const nasunPnl = calculate24hPnl('NSN', nasunUsd);
    const nbtcPnl = calculate24hPnl('NBTC', nbtcUsd);
    const nusdcPnl = calculate24hPnl('NUSDC', nusdcUsd);

    // Calculate trading and margin totals in USD
    const tradingNbtcUsd = calculateUsdValue('NBTC', Number(nbtcTrading) / 10 ** TOKENS.NBTC.decimals);
    const tradingNusdcUsd = calculateUsdValue('NUSDC', Number(nusdcTrading) / 10 ** TOKENS.NUSDC.decimals);
    const inTrading = tradingNbtcUsd + tradingNusdcUsd;

    const inMargin = calculateUsdValue('NUSDC', Number(nusdcMargin) / 10 ** TOKENS.NUSDC.decimals);

    // Total value
    const totalValue = nasunUsd + nbtcUsd + nusdcUsd;
    const totalPnl24h = nasunPnl + nbtcPnl + nusdcPnl;
    const totalChange24h = totalValue > 0 && totalPnl24h !== 0
      ? (totalPnl24h / (totalValue - totalPnl24h)) * 100
      : 0;

    // Available = Total - InTrading (trading is locked for trading purposes)
    // In Phase 16.1, we don't track open orders yet, so inOpenOrders = 0
    const inOpenOrders = 0;

    // P0-1: Available calculation guard (underflow prevention)
    // Rule: available can never exceed totalValue or go negative
    const rawAvailable = totalValue - inTrading;
    const available = Math.max(0, Math.min(rawAvailable, totalValue));

    if (rawAvailable < 0) {
      console.error('[UnifiedBalance] Available balance underflow', {
        available: rawAvailable,
        totalValue,
        inTrading,
      });
    }

    // Build breakdown
    const breakdown = {
      NSN: {
        wallet: nasunWallet,
        trading: 0n, // NSN not in BalanceManager
        margin: 0n,  // NSN not in MarginAccount
        total: nasunTotal,
        usd: nasunUsd,
        change24h: getPriceChange24h('NSN'),
        pnl24h: nasunPnl,
      },
      NBTC: {
        wallet: nbtcWallet,
        trading: nbtcTrading,
        margin: 0n, // NBTC not in MarginAccount (v0)
        total: nbtcTotal,
        usd: nbtcUsd,
        change24h: getPriceChange24h('NBTC'),
        pnl24h: nbtcPnl,
      },
      NUSDC: {
        wallet: nusdcWallet,
        trading: nusdcTrading,
        margin: nusdcMargin,
        total: nusdcTotal,
        usd: nusdcUsd,
        change24h: getPriceChange24h('NUSDC'),
        pnl24h: nusdcPnl,
      },
    };

    return {
      totalValue,
      available,
      inTrading,
      inMargin,
      inPado: inTrading + inMargin,
      inOpenOrders,
      totalPnl24h,
      totalChange24h,
      breakdown,
      // v1 preparation - not implemented yet
      marginUsagePercent: undefined,
      freeCollateral: undefined,
    };
  }, [walletBalance, bmBalance, marginAccount]);

  return {
    ...result,
    isLoading,
    hasBalanceManager,
    hasMarginAccount,
    error: marginError,
    refetch,
  };
}

/**
 * Helper to get token breakdown for display
 */
export function formatTokenBreakdown(breakdown: TokenBreakdown, symbol: TokenSymbol): {
  symbol: TokenSymbol;
  balance: string;
  price: number;
  value: string;
  change: string;
  pnl: string;
  sources: Array<{ label: string; amount: string }>;
} {
  const price = getUnifiedPrice(symbol);
  const decimals = getTokenBySymbol(symbol)?.decimals ?? 9;

  const sources: Array<{ label: string; amount: string }> = [];

  const walletAmount = Number(breakdown.wallet) / 10 ** decimals;
  if (walletAmount > 0) {
    sources.push({ label: 'Wallet', amount: walletAmount.toFixed(decimals > 6 ? 8 : 2) });
  }

  const tradingAmount = Number(breakdown.trading) / 10 ** decimals;
  if (tradingAmount > 0) {
    sources.push({ label: 'Trading', amount: tradingAmount.toFixed(decimals > 6 ? 8 : 2) });
  }

  const marginAmount = Number(breakdown.margin) / 10 ** decimals;
  if (marginAmount > 0) {
    sources.push({ label: 'Pado Balance', amount: marginAmount.toFixed(2) });
  }

  return {
    symbol,
    balance: breakdown.total.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: decimals > 6 ? 8 : 2,
    }),
    price,
    value: `$${breakdown.usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    change: `${breakdown.change24h >= 0 ? '+' : ''}${breakdown.change24h.toFixed(2)}%`,
    pnl: `${breakdown.pnl24h >= 0 ? '+' : ''}$${breakdown.pnl24h.toFixed(2)}`,
    sources,
  };
}
