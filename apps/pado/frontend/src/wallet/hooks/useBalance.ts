/**
 * Balance Hook
 * Fetch and manage wallet balances
 *
 * Pado-specific: Multi-token balance support (NASUN, NBTC, NUSDC)
 *
 * This hook wraps @nasun/wallet's useMultiBalance and provides a
 * Pado-compatible interface with nasun, nbtc, nusdc properties.
 */

import { useMultiBalance, type TokenBalance } from '@nasun/wallet';
import { TOKENS } from '../../config/network';

// Re-export TokenBalance type for backwards compatibility
export type { TokenBalance };

// Pado-specific balances interface
export interface Balances {
  nasun: TokenBalance;
  nbtc: TokenBalance;
  nusdc: TokenBalance;
}

// Default empty token balance
const emptyTokenBalance = (symbol: string, decimals: number, type: string): TokenBalance => ({
  symbol,
  balance: 0n,
  formatted: '0',
  decimals,
  type,
});

/**
 * Hook to get wallet balances (Pado-specific format)
 * Uses @nasun/wallet's useMultiBalance internally
 */
export function useBalance() {
  const { data: multiBalance, isLoading, error, refetch } = useMultiBalance({
    pollingInterval: 5000, // Refresh every 5 seconds
  });

  // Transform MultiTokenBalanceInfo to Pado's Balances format
  const data: Balances | undefined = multiBalance
    ? {
        nasun: multiBalance.native,
        nbtc: multiBalance.tokens['NBTC'] || emptyTokenBalance('NBTC', TOKENS.NBTC.decimals, TOKENS.NBTC.type),
        nusdc: multiBalance.tokens['NUSDC'] || emptyTokenBalance('NUSDC', TOKENS.NUSDC.decimals, TOKENS.NUSDC.type),
      }
    : undefined;

  return { data, isLoading, error, refetch };
}

/**
 * Hook to get NASUN balance only
 */
export function useNasunBalance() {
  const { data: balances } = useBalance();
  return balances?.nasun;
}
