/**
 * Pado Multi-Token Balance Hook
 * Fetch NASUN, NBTC, NUSDC balances
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@nasun/wallet';
import { getSuiClient } from '../lib/sui-client';
import { TOKENS } from '../config/network';

// 1 NASUN = 10^9 SOE
const NASUN_DECIMALS = 9;

export interface TokenBalance {
  symbol: string;
  balance: bigint;
  formatted: string;
  decimals: number;
}

export interface Balances {
  nasun: TokenBalance;
  nbtc: TokenBalance;
  nusdc: TokenBalance;
}

/**
 * Format balance with decimals
 */
function formatBalance(balance: bigint, decimals: number): string {
  if (balance === 0n) return '0';

  const divisor = BigInt(10 ** decimals);
  const integerPart = balance / divisor;
  const fractionalPart = balance % divisor;

  if (fractionalPart === 0n) {
    return integerPart.toString();
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  // Trim trailing zeros but keep at least 2 decimal places for display
  const trimmed = fractionalStr.replace(/0+$/, '').slice(0, 6);

  return trimmed ? `${integerPart}.${trimmed}` : integerPart.toString();
}

/**
 * Fetch all balances for an address
 */
async function fetchBalances(address: string): Promise<Balances> {
  const client = getSuiClient();
  const allBalances = await client.getAllBalances({ owner: address });

  let nasunBalance = 0n;
  let nbtcBalance = 0n;
  let nusdcBalance = 0n;

  for (const balance of allBalances) {
    if (balance.coinType === '0x2::sui::SUI') {
      nasunBalance = BigInt(balance.totalBalance);
    } else if (balance.coinType === TOKENS.NBTC.type) {
      nbtcBalance = BigInt(balance.totalBalance);
    } else if (balance.coinType === TOKENS.NUSDC.type) {
      nusdcBalance = BigInt(balance.totalBalance);
    }
  }

  return {
    nasun: {
      symbol: 'NASUN',
      balance: nasunBalance,
      formatted: formatBalance(nasunBalance, NASUN_DECIMALS),
      decimals: NASUN_DECIMALS,
    },
    nbtc: {
      symbol: 'NBTC',
      balance: nbtcBalance,
      formatted: formatBalance(nbtcBalance, TOKENS.NBTC.decimals),
      decimals: TOKENS.NBTC.decimals,
    },
    nusdc: {
      symbol: 'NUSDC',
      balance: nusdcBalance,
      formatted: formatBalance(nusdcBalance, TOKENS.NUSDC.decimals),
      decimals: TOKENS.NUSDC.decimals,
    },
  };
}

/**
 * Hook to get wallet balances (multi-token)
 */
export function useBalance() {
  const { account } = useWallet();

  return useQuery({
    queryKey: ['balances', account?.address],
    queryFn: () => fetchBalances(account!.address),
    enabled: !!account?.address,
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

/**
 * Hook to get NASUN balance only
 */
export function useNasunBalance() {
  const { data: balances } = useBalance();
  return balances?.nasun;
}
