/**
 * useTotalValue Hook
 * Calculate total portfolio value in USD with P&L
 *
 * Includes:
 * - Tokens (NASUN, NBTC, NUSDC) from wallet
 * - Trading balance (BalanceManager)
 * - Pado Balance (MarginAccount)
 * - Prediction Positions (cost basis)
 *
 * Uses unified prices from lib/prices.ts for consistency.
 *
 * @version 2.0.0 (Phase 16.1)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultiBalance, useWallet, useZkLogin } from '@nasun/wallet';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { usePredictionPositions } from '../../prediction/hooks/usePredictionPositions';
import { useMarginAccount } from '../../core/unified-margin';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { getStoredBalanceManagerId } from '../../../lib/unified-margin';
import { POOLS, TOKENS } from '../../../config/network';
import { NUSDC_DECIMALS } from '../../prediction/constants';
import {
  type TokenSymbol,
  getUnifiedPrice,
  getPriceChange24h,
  calculateUsdValue,
  calculate24hPnl,
  getAllPrices,
} from '../../../lib/prices';

export interface TokenValue {
  symbol: string;
  balance: string;
  price: number;
  value: number;
  change24h: number;  // 24h change percentage
  pnl24h: number;     // 24h P&L in USD
  source?: 'wallet' | 'trading' | 'margin' | 'combined';
}

export interface UseTotalValueResult {
  totalValue: number;
  totalPnl24h: number;      // Total 24h P&L in USD
  totalChange24h: number;   // Total 24h change percentage
  tokens: TokenValue[];
  prices: Record<TokenSymbol, number>;
  isLoading: boolean;
}

export function useTotalValue(): UseTotalValueResult {
  const adaptiveInterval = useAdaptiveInterval(10_000);
  // Get active wallet address
  const { account: walletAccount, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const activeAddress = isZkLoggedIn ? zkState?.address : (status === 'unlocked' ? walletAccount?.address : undefined);

  const { data: multiBalance, isLoading: isBalanceLoading } = useMultiBalance();
  const { positions, isLoading: isPositionsLoading } = usePredictionPositions();
  const { account: marginAccount, isLoading: isMarginLoading, hasAccount: hasMarginAccount } = useMarginAccount();

  // BalanceManager balances (DeepBook trading)
  // IMPORTANT: Use address-keyed storage to support multi-wallet
  const balanceManagerId = activeAddress ? getStoredBalanceManagerId(activeAddress) : null;
  const { data: bmBalance, isLoading: isBmLoading } = useQuery({
    queryKey: ['portfolio-bm-balance', balanceManagerId],
    queryFn: async () => {
      if (!balanceManagerId) return { base: 0, quote: 0 };
      return getBalanceManagerBalances(balanceManagerId, POOLS.NBTC_NUSDC);
    },
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
    enabled: !!balanceManagerId,
  });

  const isLoading = isBalanceLoading || isPositionsLoading || isMarginLoading || isBmLoading;

  const result = useMemo(() => {
    const tokens: TokenValue[] = [];
    const prices = getAllPrices();

    // Parse wallet balances
    const nasunWallet = Number(multiBalance?.native?.balance ?? 0n) / 10 ** TOKENS.NASUN.decimals;
    const nbtcWallet = Number(multiBalance?.tokens?.['NBTC']?.balance ?? 0n) / 10 ** TOKENS.NBTC.decimals;
    const nusdcWallet = Number(multiBalance?.tokens?.['NUSDC']?.balance ?? 0n) / 10 ** TOKENS.NUSDC.decimals;
    const nethWallet = Number(multiBalance?.tokens?.['NETH']?.balance ?? 0n) / 10 ** TOKENS.NETH.decimals;
    const nsolWallet = Number(multiBalance?.tokens?.['NSOL']?.balance ?? 0n) / 10 ** TOKENS.NSOL.decimals;

    // Parse trading balances (BalanceManager)
    const nbtcTrading = bmBalance?.base ?? 0;
    const nusdcTrading = bmBalance?.quote ?? 0;

    // Parse margin balance (MarginAccount - NUSDC only)
    const nusdcMargin = hasMarginAccount && marginAccount?.nusdcBalance
      ? Number(marginAccount.nusdcBalance) / 10 ** TOKENS.NUSDC.decimals
      : 0;

    // Calculate totals per token
    const nasunTotal = nasunWallet;
    const nbtcTotal = nbtcWallet + nbtcTrading;
    const nusdcTotal = nusdcWallet + nusdcTrading + nusdcMargin;
    const nethTotal = nethWallet;
    const nsolTotal = nsolWallet;

    // Calculate USD values using unified prices
    const nasunValue = calculateUsdValue('NASUN', nasunTotal);
    const nbtcValue = calculateUsdValue('NBTC', nbtcTotal);
    const nusdcValue = calculateUsdValue('NUSDC', nusdcTotal);
    const nethValue = calculateUsdValue('NETH', nethTotal);
    const nsolValue = calculateUsdValue('NSOL', nsolTotal);

    // Calculate 24h P&L
    const nasunPnl = calculate24hPnl('NASUN', nasunValue);
    const nbtcPnl = calculate24hPnl('NBTC', nbtcValue);
    const nusdcPnl = calculate24hPnl('NUSDC', nusdcValue);
    const nethPnl = calculate24hPnl('NETH', nethValue);
    const nsolPnl = calculate24hPnl('NSOL', nsolValue);

    // Determine source for each token
    const getNasunSource = () => 'wallet' as const;
    const getNbtcSource = () => {
      if (nbtcWallet > 0 && nbtcTrading > 0) return 'combined' as const;
      if (nbtcTrading > 0) return 'trading' as const;
      return 'wallet' as const;
    };
    const getNusdcSource = () => {
      const sources = [nusdcWallet > 0, nusdcTrading > 0, nusdcMargin > 0].filter(Boolean).length;
      if (sources > 1) return 'combined' as const;
      if (nusdcTrading > 0) return 'trading' as const;
      if (nusdcMargin > 0) return 'margin' as const;
      return 'wallet' as const;
    };

    // Add tokens to list
    if (nasunTotal > 0) {
      tokens.push({
        symbol: 'NASUN',
        balance: nasunTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
        price: getUnifiedPrice('NASUN'),
        value: nasunValue,
        change24h: getPriceChange24h('NASUN'),
        pnl24h: nasunPnl,
        source: getNasunSource(),
      });
    }

    if (nbtcTotal > 0) {
      tokens.push({
        symbol: 'NBTC',
        balance: nbtcTotal.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 }),
        price: getUnifiedPrice('NBTC'),
        value: nbtcValue,
        change24h: getPriceChange24h('NBTC'),
        pnl24h: nbtcPnl,
        source: getNbtcSource(),
      });
    }

    if (nusdcTotal > 0) {
      tokens.push({
        symbol: 'NUSDC',
        balance: nusdcTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        price: getUnifiedPrice('NUSDC'),
        value: nusdcValue,
        change24h: getPriceChange24h('NUSDC'),
        pnl24h: nusdcPnl,
        source: getNusdcSource(),
      });
    }

    if (nethTotal > 0) {
      tokens.push({
        symbol: 'NETH',
        balance: nethTotal.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 }),
        price: getUnifiedPrice('NETH'),
        value: nethValue,
        change24h: getPriceChange24h('NETH'),
        pnl24h: nethPnl,
        source: 'wallet',
      });
    }

    if (nsolTotal > 0) {
      tokens.push({
        symbol: 'NSOL',
        balance: nsolTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
        price: getUnifiedPrice('NSOL'),
        value: nsolValue,
        change24h: getPriceChange24h('NSOL'),
        pnl24h: nsolPnl,
        source: 'wallet',
      });
    }

    // Pado Balance as separate entry (for display purposes)
    if (nusdcMargin > 0) {
      tokens.push({
        symbol: 'Pado Balance',
        balance: nusdcMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        price: getUnifiedPrice('NUSDC'),
        value: calculateUsdValue('NUSDC', nusdcMargin),
        change24h: 0, // Stablecoin - no change
        pnl24h: 0,
        source: 'margin',
      });
    }

    // Calculate Predictions total value (sum of costBasis)
    const predictionsCostBasis = positions.reduce((sum, p) => sum + p.costBasis, 0n);
    const predictionsValue = Number(predictionsCostBasis) / (10 ** NUSDC_DECIMALS);
    const positionCount = positions.length;

    // Add Predictions as a separate "asset" if user has any positions
    if (positionCount > 0) {
      tokens.push({
        symbol: 'Predictions',
        balance: `${positionCount} positions`,
        price: 0, // Not applicable
        value: predictionsValue,
        change24h: 0, // TODO: Calculate real P&L when we have current prices
        pnl24h: 0,
      });
    }

    // Calculate totals (don't double-count margin in NUSDC)
    const totalValue = nasunValue + nbtcValue + nusdcValue + nethValue + nsolValue + predictionsValue;
    const totalPnl24h = nasunPnl + nbtcPnl + nusdcPnl + nethPnl + nsolPnl;
    const totalChange24h = totalValue > 0 && totalPnl24h !== 0
      ? (totalPnl24h / (totalValue - totalPnl24h)) * 100
      : 0;

    return {
      totalValue,
      totalPnl24h,
      totalChange24h,
      tokens,
      prices,
    };
  }, [multiBalance, positions, marginAccount, hasMarginAccount, bmBalance]);

  return {
    ...result,
    isLoading,
  };
}
