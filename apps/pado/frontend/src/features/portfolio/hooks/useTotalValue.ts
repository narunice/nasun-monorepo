/**
 * useTotalValue Hook
 * Calculate total portfolio value in USD with P&L
 */

import { useMemo } from 'react';
import { useMultiBalance } from '@nasun/wallet';

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
  const { data: multiBalance, isLoading } = useMultiBalance();

  const result = useMemo(() => {
    if (!multiBalance) {
      return {
        totalValue: 0,
        totalPnl24h: 0,
        totalChange24h: 0,
        tokens: [],
        prices: DEFAULT_PRICES,
      };
    }

    const nasunBalance = multiBalance.native.formatted;
    const nbtcBalance = multiBalance.tokens['NBTC']?.formatted || '0';
    const nusdcBalance = multiBalance.tokens['NUSDC']?.formatted || '0';

    const nasunValue = parseFloat(nasunBalance) * DEFAULT_PRICES.NASUN;
    const nbtcValue = parseFloat(nbtcBalance) * DEFAULT_PRICES.NBTC;
    const nusdcValue = parseFloat(nusdcBalance) * DEFAULT_PRICES.NUSDC;

    // Calculate 24h P&L for each token
    const nasunPnl = nasunValue * (SIMULATED_CHANGES.NASUN / 100);
    const nbtcPnl = nbtcValue * (SIMULATED_CHANGES.NBTC / 100);
    const nusdcPnl = nusdcValue * (SIMULATED_CHANGES.NUSDC / 100);

    const tokens: TokenValue[] = [
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
    ];

    const totalValue = nasunValue + nbtcValue + nusdcValue;
    const totalPnl24h = nasunPnl + nbtcPnl + nusdcPnl;
    const totalChange24h = totalValue > 0 ? (totalPnl24h / (totalValue - totalPnl24h)) * 100 : 0;

    return {
      totalValue,
      totalPnl24h,
      totalChange24h,
      tokens,
      prices: DEFAULT_PRICES,
    };
  }, [multiBalance]);

  return {
    ...result,
    isLoading,
  };
}
