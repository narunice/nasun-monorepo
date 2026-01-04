/**
 * useNetWorth
 * Calculate total net worth across all assets
 *
 * Unified Margin v0: Includes both wallet AND BalanceManager balances
 * This is the single source of truth for user's total portfolio value.
 *
 * TODO: Add real price oracle integration
 * Currently uses simulated prices for demonstration
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultiBalance } from '@nasun/wallet';
import { usePredictionPositions } from '../../prediction/hooks/usePredictionPositions';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { POOLS } from '../../../config/network';

// Simulated prices (will be replaced with real oracle data)
const SIMULATED_PRICES: Record<string, number> = {
  NASUN: 1.0,
  NBTC: 45000,
  NUSDC: 1.0,
};

// 24h price changes (simulated)
const SIMULATED_CHANGES: Record<string, number> = {
  NASUN: 2.5,
  NBTC: -1.2,
  NUSDC: 0.0,
};

// Storage key for BalanceManager ID
const BALANCE_MANAGER_KEY = 'pado_balance_manager';

function getStoredBalanceManagerId(): string | null {
  try {
    return localStorage.getItem(BALANCE_MANAGER_KEY);
  } catch {
    return null;
  }
}

interface TokenBalance {
  symbol: string;
  balance: bigint;
  usdValue: number;
  change24h: number;
  // Unified Margin v0: Track where the balance comes from
  source?: 'wallet' | 'trading' | 'combined';
}

interface NetWorthData {
  totalUsdValue: number;
  change24h: number;
  changePercent: number;
  tokens: TokenBalance[];
  predictionValue: number;
  // Unified Margin v0: Trading balance breakdown
  tradingBalance: {
    nbtc: number;
    nusdc: number;
    totalUsd: number;
  };
  isLoading: boolean;
}

export function useNetWorth(): NetWorthData {
  const { data: balances, isLoading: balancesLoading } = useMultiBalance();
  const { positions, isLoading: positionsLoading } = usePredictionPositions();

  // Unified Margin v0: Query BalanceManager balance (NBTC/NUSDC pool)
  const balanceManagerId = getStoredBalanceManagerId();
  const { data: bmBalance, isLoading: bmLoading } = useQuery({
    queryKey: ['bm-balance-networth', balanceManagerId],
    queryFn: async () => {
      if (!balanceManagerId) return { base: 0, quote: 0 };
      return getBalanceManagerBalances(balanceManagerId, POOLS.NBTC_NUSDC);
    },
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!balanceManagerId,
  });

  const result = useMemo(() => {
    const tokens: TokenBalance[] = [];
    let totalUsdValue = 0;
    let previousDayValue = 0;

    // Unified Margin v0: Track trading balances separately
    const tradingNbtc = bmBalance?.base ?? 0;
    const tradingNusdc = bmBalance?.quote ?? 0;
    const tradingNbtcUsd = tradingNbtc * SIMULATED_PRICES.NBTC;
    const tradingNusdcUsd = tradingNusdc * SIMULATED_PRICES.NUSDC;
    const tradingTotalUsd = tradingNbtcUsd + tradingNusdcUsd;

    // Calculate wallet token balances
    if (balances) {
      // Native token (NASUN)
      if (balances.native && balances.native.balance > 0n) {
        const symbol = balances.native.symbol;
        const balance = balances.native.balance;
        const decimals = balances.native.decimals;
        const amount = Number(balance) / Math.pow(10, decimals);
        const price = SIMULATED_PRICES[symbol] || 1.0;
        const usdValue = amount * price;
        const change24h = SIMULATED_CHANGES[symbol] || 0;

        tokens.push({ symbol, balance, usdValue, change24h, source: 'wallet' });
        totalUsdValue += usdValue;
        previousDayValue += usdValue / (1 + change24h / 100);
      }

      // Other tokens (NBTC, NUSDC, etc.)
      if (balances.tokens) {
        for (const [symbol, tokenData] of Object.entries(balances.tokens)) {
          if (tokenData && tokenData.balance > 0n) {
            const balance = tokenData.balance;
            const decimals = tokenData.decimals;
            const walletAmount = Number(balance) / Math.pow(10, decimals);

            // Unified Margin v0: Add trading balance to matching tokens
            let totalAmount = walletAmount;
            if (symbol === 'NBTC') {
              totalAmount += tradingNbtc;
            } else if (symbol === 'NUSDC') {
              totalAmount += tradingNusdc;
            }

            const price = SIMULATED_PRICES[symbol] || 1.0;
            const usdValue = totalAmount * price;
            const change24h = SIMULATED_CHANGES[symbol] || 0;

            // Determine source for display
            const hasWallet = walletAmount > 0;
            const hasTrading = (symbol === 'NBTC' && tradingNbtc > 0) || (symbol === 'NUSDC' && tradingNusdc > 0);
            const source = hasWallet && hasTrading ? 'combined' : hasTrading ? 'trading' : 'wallet';

            tokens.push({ symbol, balance, usdValue, change24h, source });
            totalUsdValue += usdValue;
            previousDayValue += usdValue / (1 + change24h / 100);
          }
        }
      }

      // Unified Margin v0: Add trading-only tokens (if not in wallet)
      if (!balances.tokens?.NBTC && tradingNbtc > 0) {
        const usdValue = tradingNbtc * SIMULATED_PRICES.NBTC;
        const change24h = SIMULATED_CHANGES.NBTC || 0;
        tokens.push({
          symbol: 'NBTC',
          balance: BigInt(Math.round(tradingNbtc * 1e8)),
          usdValue,
          change24h,
          source: 'trading',
        });
        totalUsdValue += usdValue;
        previousDayValue += usdValue / (1 + change24h / 100);
      }
      if (!balances.tokens?.NUSDC && tradingNusdc > 0) {
        const usdValue = tradingNusdc * SIMULATED_PRICES.NUSDC;
        const change24h = SIMULATED_CHANGES.NUSDC || 0;
        tokens.push({
          symbol: 'NUSDC',
          balance: BigInt(Math.round(tradingNusdc * 1e6)),
          usdValue,
          change24h,
          source: 'trading',
        });
        totalUsdValue += usdValue;
        previousDayValue += usdValue / (1 + change24h / 100);
      }
    }

    // Add prediction positions value
    let predictionValue = 0;
    if (positions) {
      for (const position of positions) {
        // Each position's value = shares * current probability (estimated)
        const shares = Number(position.shares) / 1e6;
        const estimatedPrice = 0.5; // TODO: Use actual market probability
        predictionValue += shares * estimatedPrice;
      }
    }

    totalUsdValue += predictionValue;

    // Calculate overall 24h change
    const change24h = totalUsdValue - previousDayValue;
    const changePercent = previousDayValue > 0 ? (change24h / previousDayValue) * 100 : 0;

    return {
      totalUsdValue,
      change24h,
      changePercent,
      tokens,
      predictionValue,
      // Unified Margin v0: Expose trading balance breakdown
      tradingBalance: {
        nbtc: tradingNbtc,
        nusdc: tradingNusdc,
        totalUsd: tradingTotalUsd,
      },
      isLoading: balancesLoading || positionsLoading || bmLoading,
    };
  }, [balances, positions, bmBalance, balancesLoading, positionsLoading, bmLoading]);

  return result;
}
