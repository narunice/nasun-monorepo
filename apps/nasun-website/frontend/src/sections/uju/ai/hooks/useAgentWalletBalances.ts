/**
 * useAgentWalletBalances — agent's Trading Wallet balance fetcher.
 *
 * Returns one entry per known TOKENS entry (NASUN/NUSDC/NBTC). The Sui RPC's
 * getAllBalances only returns coin types the address actually owns, so
 * zero-balance coins are missing from the response and must be joined back
 * in from the TOKENS catalog.
 */

import { useQuery } from '@tanstack/react-query';
import { suiClient } from '@/lib/sui-client';
import { TOKENS, type TokenSymbol } from '../services/network';

export interface AgentTokenBalance {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  type: string;
  totalBalanceRaw: bigint;
}

async function fetchAgentBalances(agentAddress: string): Promise<AgentTokenBalance[]> {
  const balances = await suiClient.getAllBalances({ owner: agentAddress });
  const byType = new Map<string, string>();
  for (const b of balances) byType.set(b.coinType, b.totalBalance);

  return (Object.keys(TOKENS) as TokenSymbol[]).map((symbol) => {
    const meta = TOKENS[symbol];
    const raw = byType.get(meta.type) ?? '0';
    return {
      symbol,
      name: meta.name,
      decimals: meta.decimals,
      type: meta.type,
      totalBalanceRaw: BigInt(raw),
    };
  });
}

export function useAgentWalletBalances(agentAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['nasun-ai', 'agentWalletBalances', agentAddress],
    queryFn: () => fetchAgentBalances(agentAddress!),
    enabled: !!agentAddress,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

/** Owner's NASUN (gas) balance, used by the Low NASUN hint. */
export function useOwnerNasunBalance(walletAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['nasun-ai', 'ownerNasunBalance', walletAddress],
    queryFn: async () => {
      const b = await suiClient.getBalance({
        owner: walletAddress!,
        coinType: TOKENS.NASUN.type,
      });
      return BigInt(b.totalBalance);
    },
    enabled: !!walletAddress,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function formatTokenBalance(b: AgentTokenBalance, fractionDigits = 4): string {
  const divisor = 10n ** BigInt(b.decimals);
  const whole = b.totalBalanceRaw / divisor;
  const frac = b.totalBalanceRaw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(b.decimals, '0').slice(0, fractionDigits).replace(/0+$/, '');
  return fracStr.length === 0 ? whole.toString() : `${whole}.${fracStr}`;
}
