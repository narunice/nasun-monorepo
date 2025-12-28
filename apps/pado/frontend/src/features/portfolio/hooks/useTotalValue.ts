/**
 * useTotalValue Hook
 * Calculate total portfolio value in USD
 */

import { useMemo } from 'react';
import { useMultiBalance } from '@nasun/wallet';

// Default prices for MVP (will be replaced with oracle/API prices later)
const DEFAULT_PRICES = {
  NASUN: 0.10,   // $0.10 per NASUN
  NBTC: 95000,   // $95,000 per BTC
  NUSDC: 1,      // $1 per USDC (stablecoin)
} as const;

export interface TokenValue {
  symbol: string;
  balance: string;
  price: number;
  value: number;
}

export interface UseTotalValueResult {
  totalValue: number;
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

    const tokens: TokenValue[] = [
      {
        symbol: 'NASUN',
        balance: nasunBalance,
        price: DEFAULT_PRICES.NASUN,
        value: nasunValue,
      },
      {
        symbol: 'NBTC',
        balance: nbtcBalance,
        price: DEFAULT_PRICES.NBTC,
        value: nbtcValue,
      },
      {
        symbol: 'NUSDC',
        balance: nusdcBalance,
        price: DEFAULT_PRICES.NUSDC,
        value: nusdcValue,
      },
    ];

    return {
      totalValue: nasunValue + nbtcValue + nusdcValue,
      tokens,
      prices: DEFAULT_PRICES,
    };
  }, [multiBalance]);

  return {
    ...result,
    isLoading,
  };
}
