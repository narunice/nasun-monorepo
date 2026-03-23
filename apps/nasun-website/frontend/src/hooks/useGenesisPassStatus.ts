/**
 * useGenesisPassStatus Hook
 *
 * Checks Genesis Pass allowlist registration status.
 * - Primary: public check by wallet address (when MetaMask is linked)
 * - Fallback: authenticated check by identity (when MetaMask is unlinked)
 */

import { useState, useEffect, useCallback } from "react";
import { checkGenesisPass, getMyGenesisPassStatus, type GenesisPassStatus } from "@/services/genesisPassApi";

const REFETCH_EVENT = "genesis-pass-status-refetch";

const API_CONFIGURED = !!import.meta.env.VITE_GENESIS_PASS_API;

interface UseGenesisPassStatusReturn {
  isRegistered: boolean;
  isApplied: boolean;
  status: GenesisPassStatus;
  registeredWallet: string | null;
  registeredAt: string | null;
  mintType: string | null;
  isLoading: boolean;
  error: string | null;
  isConfigured: boolean;
  refetch: () => Promise<void>;
}

/**
 * Dispatch a global refetch event so all hook instances re-query the API.
 */
export function invalidateGenesisPassStatus(): void {
  window.dispatchEvent(new Event(REFETCH_EVENT));
}

export function useGenesisPassStatus(
  walletAddress: string | null | undefined,
  cognitoToken?: string | null,
): UseGenesisPassStatusReturn {
  const [isRegistered, setIsRegistered] = useState(false);
  const [isApplied, setIsApplied] = useState(false);
  const [status, setStatus] = useState<GenesisPassStatus>(null);
  const [registeredWallet, setRegisteredWallet] = useState<string | null>(null);
  const [registeredAt, setRegisteredAt] = useState<string | null>(null);
  const [mintType, setMintType] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const resetState = () => {
      setIsRegistered(false);
      setIsApplied(false);
      setStatus(null);
      setRegisteredWallet(null);
      setRegisteredAt(null);
      setMintType(null);
    };

    if (!API_CONFIGURED) {
      setIsLoading(false);
      resetState();
      return;
    }

    // No wallet and no token: cannot check status
    if (!walletAddress && !cognitoToken) {
      setIsLoading(false);
      resetState();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Prefer identity-based lookup (returns the actual registered wallet,
      // enabling mismatch detection when user changes MetaMask).
      // Fall back to public wallet-based check when no token is available.
      const res = cognitoToken
        ? await getMyGenesisPassStatus(cognitoToken)
        : await checkGenesisPass(walletAddress!);

      setIsRegistered(res.data.registered);
      setIsApplied(res.data.applied ?? false);
      setStatus(res.data.status ?? null);
      setRegisteredWallet(res.data.walletAddress ?? null);
      setRegisteredAt(res.data.registeredAt ?? null);
      // mintType is only available via authenticated endpoint (cognitoToken path)
      setMintType(res.data.mintType ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check Genesis Pass status";
      console.error("[useGenesisPassStatus]", message);
      setError(message);
      resetState();
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, cognitoToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Listen for global refetch events from other components
  useEffect(() => {
    const handler = () => { fetchStatus(); };
    window.addEventListener(REFETCH_EVENT, handler);
    return () => window.removeEventListener(REFETCH_EVENT, handler);
  }, [fetchStatus]);

  return {
    isRegistered,
    isApplied,
    status,
    registeredWallet,
    registeredAt,
    mintType,
    isLoading,
    error,
    isConfigured: API_CONFIGURED,
    refetch: fetchStatus,
  };
}
