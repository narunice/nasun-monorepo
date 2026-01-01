/**
 * useNetWorth
 * Calculate total net worth across all assets
 *
 * TODO: Add real price oracle integration
 * Currently uses simulated prices for demonstration
 */

import { useMemo } from 'react';
import { useMultiBalance } from '@nasun/wallet';
import { usePredictionPositions } from '../../prediction/hooks/usePredictionPositions';

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

interface TokenBalance {
  symbol: string;
  balance: bigint;
  usdValue: number;
  change24h: number;
}

interface NetWorthData {
  totalUsdValue: number;
  change24h: number;
  changePercent: number;
  tokens: TokenBalance[];
  predictionValue: number;
  isLoading: boolean;
}

export function useNetWorth(): NetWorthData {
  const { data: balances, isLoading: balancesLoading } = useMultiBalance();
  const { positions, isLoading: positionsLoading } = usePredictionPositions();

  const result = useMemo(() => {
    const tokens: TokenBalance[] = [];
    let totalUsdValue = 0;
    let previousDayValue = 0;

    // Calculate token balances
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

        tokens.push({ symbol, balance, usdValue, change24h });
        totalUsdValue += usdValue;
        previousDayValue += usdValue / (1 + change24h / 100);
      }

      // Other tokens (NBTC, NUSDC, etc.)
      if (balances.tokens) {
        for (const [symbol, tokenData] of Object.entries(balances.tokens)) {
          if (tokenData && tokenData.balance > 0n) {
            const balance = tokenData.balance;
            const decimals = tokenData.decimals;
            const amount = Number(balance) / Math.pow(10, decimals);
            const price = SIMULATED_PRICES[symbol] || 1.0;
            const usdValue = amount * price;
            const change24h = SIMULATED_CHANGES[symbol] || 0;

            tokens.push({ symbol, balance, usdValue, change24h });
            totalUsdValue += usdValue;
            previousDayValue += usdValue / (1 + change24h / 100);
          }
        }
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
      isLoading: balancesLoading || positionsLoading,
    };
  }, [balances, positions, balancesLoading, positionsLoading]);

  return result;
}
