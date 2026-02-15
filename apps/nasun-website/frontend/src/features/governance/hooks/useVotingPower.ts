/**
 * useVotingPower Hook (V2)
 *
 * Fetches user's voting power from backend V2 API.
 * Sources: Base + Leaderboard + On-Chain Activity + Allowlist + X Linked
 */

import { useState, useCallback } from "react";

const GOVERNANCE_API_URL = import.meta.env.VITE_GOVERNANCE_API_URL || "/api/governance";

export interface VotingPowerBreakdown {
  base: number;
  leaderboard: number;
  onChain: number;
  battalionAllowlist: number;
  genesisAllowlist: number;
  xLinked: number;
}

export interface VotingPowerData {
  totalVotingPower: number;
  breakdown: VotingPowerBreakdown;
  rawScores: {
    leaderboardScore: number;
    onChainScore: number;
  };
  normalized: {
    leaderboardNormalized: number;
    onChainNormalized: number;
  };
}

interface UseVotingPowerReturn {
  votingPower: VotingPowerData | null;
  isLoading: boolean;
  error: string | null;
  fetchVotingPower: (twitterHandle?: string, walletAddress?: string, ethAddress?: string) => Promise<void>;
}

export function useVotingPower(): UseVotingPowerReturn {
  const [votingPower, setVotingPower] = useState<VotingPowerData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVotingPower = useCallback(async (twitterHandle?: string, walletAddress?: string, ethAddress?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (twitterHandle) params.set("twitterHandle", twitterHandle);
      if (walletAddress) params.set("walletAddress", walletAddress);
      if (ethAddress) params.set("ethAddress", ethAddress);

      const response = await fetch(`${GOVERNANCE_API_URL}/voting-power?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch voting power");
      }

      const data: VotingPowerData = await response.json();
      setVotingPower(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch voting power";
      console.error("Error fetching voting power:", err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    votingPower,
    isLoading,
    error,
    fetchVotingPower,
  };
}
