/**
 * useTotalValue Hook
 * Calculate total portfolio value in USD with P&L
 * Includes: Tokens (NASUN, NBTC, NUSDC) + Pado Balance + Prediction Positions
 */

import { useMemo } from 'react';
import { useMultiBalance } from '@nasun/wallet';
import { usePredictionPositions } from '../../prediction/hooks/usePredictionPositions';
import { useMarginAccount } from '../../core/unified-margin';
import { NUSDC_DECIMALS } from '../../prediction/constants';

// Default prices for MVP (will be replaced with oracle/API prices later)
const DEFAULT_PRICES = {
  NASUN: 0.10,   // $0.10 per NASUN
  NBTC: 95000,   // $95,000 per BTC
  NUSDC: 1,      // $1 per USDC (stablecoin)
} as const;

// Simulated 24h price changes (will be replaced with real data later)
const SIMULATED_CHANGES = {
  NASUN: 2.5,    // +2.5%
  NBTC: -1.2,    // -1.2%
  NUSDC: 0,      // stablecoin - no change
} as const;

export interface TokenValue {
  symbol: string;
  balance: string;
  price: number;
  value: number;
  change24h: number;  // 24h change percentage
  pnl24h: number;     // 24h P&L in USD
}

export interface UseTotalValueResult {
  totalValue: number;
  totalPnl24h: number;      // Total 24h P&L in USD
  totalChange24h: number;   // Total 24h change percentage
  tokens: TokenValue[];
  prices: typeof DEFAULT_PRICES;
  isLoading: boolean;
}

export function useTotalValue(): UseTotalValueResult {
  const { data: multiBalance, isLoading: isBalanceLoading } = useMultiBalance();
  const { positions, isLoading: isPositionsLoading } = usePredictionPositions();
  const { account: marginAccount, isLoading: isMarginLoading, hasAccount: hasMarginAccount } = useMarginAccount();

  const isLoading = isBalanceLoading || isPositionsLoading || isMarginLoading;

  const result = useMemo(() => {
    const tokens: TokenValue[] = [];

    // Token balances
    const nasunBalance = multiBalance?.native.formatted || '0';
    const nbtcBalance = multiBalance?.tokens['NBTC']?.formatted || '0';
    const nusdcBalance = multiBalance?.tokens['NUSDC']?.formatted || '0';

    const nasunValue = parseFloat(nasunBalance) * DEFAULT_PRICES.NASUN;
    const nbtcValue = parseFloat(nbtcBalance) * DEFAULT_PRICES.NBTC;
    const nusdcValue = parseFloat(nusdcBalance) * DEFAULT_PRICES.NUSDC;

    // Calculate 24h P&L for each token
    const nasunPnl = nasunValue * (SIMULATED_CHANGES.NASUN / 100);
    const nbtcPnl = nbtcValue * (SIMULATED_CHANGES.NBTC / 100);
    const nusdcPnl = nusdcValue * (SIMULATED_CHANGES.NUSDC / 100);

    tokens.push(
      {
        symbol: 'NASUN',
        balance: nasunBalance,
        price: DEFAULT_PRICES.NASUN,
        value: nasunValue,
        change24h: SIMULATED_CHANGES.NASUN,
        pnl24h: nasunPnl,
      },
      {
        symbol: 'NBTC',
        balance: nbtcBalance,
        price: DEFAULT_PRICES.NBTC,
        value: nbtcValue,
        change24h: SIMULATED_CHANGES.NBTC,
        pnl24h: nbtcPnl,
      },
      {
        symbol: 'NUSDC',
        balance: nusdcBalance,
        price: DEFAULT_PRICES.NUSDC,
        value: nusdcValue,
        change24h: SIMULATED_CHANGES.NUSDC,
        pnl24h: nusdcPnl,
      },
    );

    // Pado Balance (NUSDC in margin account)
    const padoBalanceRaw = hasMarginAccount && marginAccount?.nusdcBalance
      ? Number(marginAccount.nusdcBalance) / 1e6
      : 0;
    const padoBalanceValue = padoBalanceRaw * DEFAULT_PRICES.NUSDC;

    // Add Pado Balance as a separate "asset" if user has any funds
    if (padoBalanceRaw > 0) {
      tokens.push({
        symbol: 'Pado Balance',
        balance: padoBalanceRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        price: DEFAULT_PRICES.NUSDC,
        value: padoBalanceValue,
        change24h: 0, // Stablecoin - no change
        pnl24h: 0,
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

    const totalValue = nasunValue + nbtcValue + nusdcValue + padoBalanceValue + predictionsValue;
    const totalPnl24h = nasunPnl + nbtcPnl + nusdcPnl;
    const totalChange24h = totalValue > 0 ? (totalPnl24h / (totalValue - totalPnl24h)) * 100 : 0;

    return {
      totalValue,
      totalPnl24h,
      totalChange24h,
      tokens,
      prices: DEFAULT_PRICES,
    };
  }, [multiBalance, positions, marginAccount, hasMarginAccount]);

  return {
    ...result,
    isLoading,
  };
}
