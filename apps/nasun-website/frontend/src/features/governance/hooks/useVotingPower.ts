/**
 * useVotingPower Hook
 *
 * Fetches and calculates user's voting power from:
 * - Leaderboard Score (X/Twitter engagement)
 * - Ethereum NFT Bonus (verified via MetaMask signature)
 * - NASUN Token Balance (post-TGE)
 */

import { useState, useCallback } from "react";

// API base URL
const GOVERNANCE_API_URL = import.meta.env.VITE_GOVERNANCE_API_URL || "/api/governance";

export interface VotingPowerBreakdown {
  leaderboard: number;
  nft: number;
  token: number;
}

export interface VotingPowerData {
  address: string;
  twitterHandle?: string;
  leaderboardScore: number;
  nftBonus: number;
  tokenBalance: number;
  totalVotingPower: number;
  breakdown: VotingPowerBreakdown;
}

export interface NftVerificationResult {
  ethAddress: string;
  hasNasunNft: boolean;
  nftBonus: number;
}

interface UseVotingPowerReturn {
  votingPower: VotingPowerData | null;
  nftVerification: NftVerificationResult | null;
  isLoading: boolean;
  error: string | null;
  fetchVotingPower: (twitterHandle?: string) => Promise<void>;
  verifyNftOwnership: (proposalId: string) => Promise<NftVerificationResult | null>;
  clearNftVerification: () => void;
}

/**
 * Request MetaMask signature for NFT verification
 */
async function signForNftVerification(proposalId: string): Promise<{
  message: string;
  signature: string;
} | null> {
  if (typeof window === "undefined" || !window.ethereum) {
    console.error("MetaMask not installed");
    return null;
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    if (!accounts || accounts.length === 0) {
      console.error("No accounts found");
      return null;
    }

    const account = accounts[0];

    // Create message to sign
    const message = `Nasun Governance: Verify NFT ownership for Proposal #${proposalId}\nTimestamp: ${Date.now()}`;

    // Request signature
    const signature = await window.ethereum.request({
      method: "personal_sign",
      params: [message, account],
    });

    return { message, signature };
  } catch (error) {
    console.error("MetaMask signing failed:", error);
    return null;
  }
}

export function useVotingPower(): UseVotingPowerReturn {
  const [votingPower, setVotingPower] = useState<VotingPowerData | null>(null);
  const [nftVerification, setNftVerification] = useState<NftVerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch voting power from backend
   */
  const fetchVotingPower = useCallback(async (twitterHandle?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (twitterHandle) params.set("twitterHandle", twitterHandle);
      if (nftVerification?.hasNasunNft) params.set("nftBonus", "true");

      const response = await fetch(`${GOVERNANCE_API_URL}/voting-power?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch voting power");
      }

      const data: VotingPowerData = await response.json();
      setVotingPower(data);
    } catch (err: any) {
      console.error("Error fetching voting power:", err);
      setError(err.message || "Failed to fetch voting power");
    } finally {
      setIsLoading(false);
    }
  }, [nftVerification?.hasNasunNft]);

  /**
   * Verify NFT ownership via MetaMask signature
   */
  const verifyNftOwnership = useCallback(async (proposalId: string): Promise<NftVerificationResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Get MetaMask signature
      const signResult = await signForNftVerification(proposalId);
      if (!signResult) {
        throw new Error("MetaMask signing cancelled or failed");
      }

      // Verify signature on backend
      const response = await fetch(`${GOVERNANCE_API_URL}/verify-nft`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: signResult.message,
          signature: signResult.signature,
          proposalId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "NFT verification failed");
      }

      const result: NftVerificationResult = await response.json();
      setNftVerification(result);
      return result;
    } catch (err: any) {
      console.error("NFT verification error:", err);
      setError(err.message || "NFT verification failed");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear NFT verification state
   */
  const clearNftVerification = useCallback(() => {
    setNftVerification(null);
  }, []);

  return {
    votingPower,
    nftVerification,
    isLoading,
    error,
    fetchVotingPower,
    verifyNftOwnership,
    clearNftVerification,
  };
}

// Extend Window interface for MetaMask
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      isMetaMask?: boolean;
    };
  }
}
