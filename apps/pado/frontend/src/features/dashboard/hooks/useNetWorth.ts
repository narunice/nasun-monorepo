/**
 * useNetWorth
 * Calculate total net worth across all assets
 *
 * Unified Margin v0.2: Includes Wallet + BalanceManager + MarginAccount balances
 * Uses unified prices from lib/prices.ts for consistency across the app.
 *
 * @version 2.0.0 (Phase 16.1)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMultiBalance, useWallet, useZkLogin } from '@nasun/wallet';
import { usePredictionPositions } from '../../prediction/hooks/usePredictionPositions';
import { useMarginAccount } from '../../core/unified-margin';
import { getBalanceManagerBalances } from '../../../lib/deepbook';
import { getStoredBalanceManagerId } from '../../../lib/unified-margin';
import { POOLS, TOKENS } from '../../../config/network';
import {
  type TokenSymbol,
  getPriceChange24h,
  calculateUsdValue,
  calculate24hPnl,
} from '../../../lib/prices';

interface TokenBalance {
  symbol: string;
  balance: bigint;
  usdValue: number;
  change24h: number;
  source?: 'wallet' | 'trading' | 'margin' | 'combined';
}

interface NetWorthData {
  totalUsdValue: number;
  change24h: number;
  changePercent: number;
  tokens: TokenBalance[];
  predictionValue: number;
  // Unified Margin v0.2: Balance breakdown by source
  tradingBalance: {
    nbtc: number;
    nusdc: number;
    totalUsd: number;
  };
  marginBalance: {
    nusdc: number;
    totalUsd: number;
  };
  isLoading: boolean;
}

export function useNetWorth(): NetWorthData {
  // Get active wallet address
  const { account: walletAccount, status } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const activeAddress = isZkLoggedIn ? zkState?.address : (status === 'unlocked' ? walletAccount?.address : undefined);

  const { data: balances, isLoading: balancesLoading } = useMultiBalance();
  const { positions, isLoading: positionsLoading } = usePredictionPositions();

  // Unified Margin v0.2: Query MarginAccount balance
  const {
    account: marginAccount,
    hasAccount: hasMarginAccount,
    isLoading: marginLoading,
  } = useMarginAccount();

  // Query BalanceManager balance (NBTC/NUSDC pool)
  // IMPORTANT: Use address-keyed storage to support multi-wallet
  const balanceManagerId = activeAddress ? getStoredBalanceManagerId(activeAddress) : null;
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

    // Trading balances (BalanceManager)
    const tradingNbtc = bmBalance?.base ?? 0;
    const tradingNusdc = bmBalance?.quote ?? 0;
    const tradingNbtcUsd = calculateUsdValue('NBTC', tradingNbtc);
    const tradingNusdcUsd = calculateUsdValue('NUSDC', tradingNusdc);
    const tradingTotalUsd = tradingNbtcUsd + tradingNusdcUsd;

    // Margin balance (MarginAccount - NUSDC only)
    const marginNusdc = hasMarginAccount && marginAccount?.nusdcBalance
      ? Number(marginAccount.nusdcBalance) / 10 ** TOKENS.NUSDC.decimals
      : 0;
    const marginNusdcUsd = calculateUsdValue('NUSDC', marginNusdc);

    // Calculate wallet token balances
    if (balances) {
      // Native token (NASUN)
      if (balances.native && balances.native.balance > 0n) {
        const symbol = balances.native.symbol as TokenSymbol;
        const balance = balances.native.balance;
        const decimals = balances.native.decimals;
        const amount = Number(balance) / Math.pow(10, decimals);
        const usdValue = calculateUsdValue(symbol, amount);
        const change24h = getPriceChange24h(symbol);
        const pnl = calculate24hPnl(symbol, usdValue);

        tokens.push({ symbol, balance, usdValue, change24h, source: 'wallet' });
        totalUsdValue += usdValue;
        previousDayValue += usdValue - pnl;
      }

      // Other tokens (NBTC, NUSDC, etc.)
      if (balances.tokens) {
        for (const [symbol, tokenData] of Object.entries(balances.tokens)) {
          if (tokenData && tokenData.balance > 0n) {
            const balance = tokenData.balance;
            const decimals = tokenData.decimals;
            const walletAmount = Number(balance) / Math.pow(10, decimals);

            // Add trading and margin balances to matching tokens
            let totalAmount = walletAmount;
            if (symbol === 'NBTC') {
              totalAmount += tradingNbtc;
            } else if (symbol === 'NUSDC') {
              totalAmount += tradingNusdc + marginNusdc;
            }

            const tokenSymbol = symbol as TokenSymbol;
            const usdValue = calculateUsdValue(tokenSymbol, totalAmount);
            const change24h = getPriceChange24h(tokenSymbol);
            const pnl = calculate24hPnl(tokenSymbol, usdValue);

            // Determine source for display
            const hasWallet = walletAmount > 0;
            const hasTrading = (symbol === 'NBTC' && tradingNbtc > 0) || (symbol === 'NUSDC' && tradingNusdc > 0);
            const hasMargin = symbol === 'NUSDC' && marginNusdc > 0;
            const sourceCount = [hasWallet, hasTrading, hasMargin].filter(Boolean).length;
            const source: TokenBalance['source'] = sourceCount > 1 ? 'combined' : hasTrading ? 'trading' : hasMargin ? 'margin' : 'wallet';

            tokens.push({ symbol, balance, usdValue, change24h, source });
            totalUsdValue += usdValue;
            previousDayValue += usdValue - pnl;
          }
        }
      }

      // Add trading-only tokens (if not in wallet)
      if (!balances.tokens?.NBTC && tradingNbtc > 0) {
        const usdValue = calculateUsdValue('NBTC', tradingNbtc);
        const change24h = getPriceChange24h('NBTC');
        const pnl = calculate24hPnl('NBTC', usdValue);
        tokens.push({
          symbol: 'NBTC',
          balance: BigInt(Math.round(tradingNbtc * 10 ** TOKENS.NBTC.decimals)),
          usdValue,
          change24h,
          source: 'trading',
        });
        totalUsdValue += usdValue;
        previousDayValue += usdValue - pnl;
      }
      if (!balances.tokens?.NUSDC && (tradingNusdc > 0 || marginNusdc > 0)) {
        const totalNusdc = tradingNusdc + marginNusdc;
        const usdValue = calculateUsdValue('NUSDC', totalNusdc);
        const change24h = getPriceChange24h('NUSDC');
        const pnl = calculate24hPnl('NUSDC', usdValue);
        const source: TokenBalance['source'] = tradingNusdc > 0 && marginNusdc > 0 ? 'combined' : tradingNusdc > 0 ? 'trading' : 'margin';
        tokens.push({
          symbol: 'NUSDC',
          balance: BigInt(Math.round(totalNusdc * 10 ** TOKENS.NUSDC.decimals)),
          usdValue,
          change24h,
          source,
        });
        totalUsdValue += usdValue;
        previousDayValue += usdValue - pnl;
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
      tradingBalance: {
        nbtc: tradingNbtc,
        nusdc: tradingNusdc,
        totalUsd: tradingTotalUsd,
      },
      marginBalance: {
        nusdc: marginNusdc,
        totalUsd: marginNusdcUsd,
      },
      isLoading: balancesLoading || positionsLoading || bmLoading || marginLoading,
    };
  }, [balances, positions, bmBalance, marginAccount, hasMarginAccount, balancesLoading, positionsLoading, bmLoading, marginLoading]);

  return result;
}
