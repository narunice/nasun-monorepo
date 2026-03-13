/**
 * useGenesisPassStatus Hook
 *
 * Checks Genesis Pass allowlist registration status by EVM wallet address.
 * Uses the public checkGenesisPass API (no auth required).
 *
 * NOTE: This is separate from useGenesisNftStatus which handles
 * Battalion NFT (X-account-based). Genesis Pass is EVM-wallet-based.
 */

import { useState, useEffect, useCallback } from "react";
import { checkGenesisPass } from "@/services/genesisPassApi";

const API_CONFIGURED = !!import.meta.env.VITE_GENESIS_PASS_API;

interface UseGenesisPassStatusReturn {
  isRegistered: boolean;
  registeredWallet: string | null;
  registeredAt: string | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  refetch: () => Promise<void>;
}

export function useGenesisPassStatus(
  walletAddress: string | null | undefined,
): UseGenesisPassStatusReturn {
  const [isRegistered, setIsRegistered] = useState(false);
  const [registeredWallet, setRegisteredWallet] = useState<string | null>(null);
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!walletAddress || !API_CONFIGURED) {
      setIsLoading(false);
      setIsRegistered(false);
      setRegisteredWallet(null);
      setRegisteredAt(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await checkGenesisPass(walletAddress);
      setIsRegistered(res.data.registered);
      setRegisteredWallet(res.data.walletAddress ?? null);
      setRegisteredAt(res.data.registeredAt ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check Genesis Pass status";
      console.error("[useGenesisPassStatus]", message);
      setError(message);
      setIsRegistered(false);
      setRegisteredWallet(null);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    isRegistered,
    registeredWallet,
    registeredAt,
    isLoading,
    error,
    isConfigured: API_CONFIGURED,
    refetch: fetchStatus,
  };
}
