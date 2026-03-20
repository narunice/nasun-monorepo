/**
 * useVotingPower Hook (V3)
 *
 * Fetches user's voting power from backend V3 API using React Query.
 * Sources: Base + X Linked + Telegram + Leaderboard Rank Bonus
 *
 * Wallet address is resolved internally via useWallet/useZkLogin.
 * All consumers share the same cache via query key.
 */

import { useQuery } from "@tanstack/react-query";
import { useWallet, useZkLogin } from "@nasun/wallet";

const GOVERNANCE_API_URL = import.meta.env.VITE_GOVERNANCE_API_URL || "/api/governance";

export const VOTING_POWER_QUERY_KEY = "voting-power";

export interface VotingPowerBreakdown {
  base: number;
  xLinked: number;
  telegram: number;
  rankBonus: number;
  // Backward compatibility (old field names from V2)
  leaderboard?: number;
  onChain?: number;
  battalionAllowlist?: number;
  genesisAllowlist?: number;
}

export interface VotingPowerData {
  totalVotingPower: number;
  rank: number | null;
  breakdown: VotingPowerBreakdown;
}

async function fetchVotingPowerFn(walletAddress: string): Promise<VotingPowerData> {
  const params = new URLSearchParams({ walletAddress });
  const response = await fetch(`${GOVERNANCE_API_URL}/voting-power?${params}`);
  if (!response.ok) throw new Error("Failed to fetch voting power");
  return response.json();
}

export function useVotingPower() {
  const { account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const walletAddress = isZkConnected ? zkState?.address : account?.address;

  const query = useQuery({
    queryKey: [VOTING_POWER_QUERY_KEY, walletAddress],
    queryFn: () => fetchVotingPowerFn(walletAddress!),
    enabled: !!walletAddress,
    staleTime: 30_000,
  });

  return {
    votingPower: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message ?? null,
  };
}
