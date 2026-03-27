/**
 * useAllianceMintStatus Hook
 *
 * Checks Alliance NFT mint status and provides registered wallet list.
 * Follows useGenesisPassStatus pattern with global invalidation.
 */

import { useState, useEffect, useCallback } from "react";
import { getAllianceStatus, isAllianceApiConfigured, type AllianceWallet } from "@/services/allianceNftApi";

const REFETCH_EVENT = "alliance-mint-status-refetch";

const API_CONFIGURED = isAllianceApiConfigured();

interface AllianceMintData {
  imageIndex: number;
  walletAddress: string;
  txDigest: string;
  nftObjectId: string;
  mintedAt: string;
}

interface UseAllianceMintStatusReturn {
  isMinted: boolean;
  isLoading: boolean;
  data: AllianceMintData | null;
  wallets: AllianceWallet[];
  error: string | null;
  isConfigured: boolean;
  refetch: () => Promise<void>;
}

export function invalidateAllianceMintStatus(): void {
  window.dispatchEvent(new Event(REFETCH_EVENT));
}

export function useAllianceMintStatus(
  cognitoToken?: string | null,
): UseAllianceMintStatusReturn {
  const [isMinted, setIsMinted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<AllianceMintData | null>(null);
  const [wallets, setWallets] = useState<AllianceWallet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!API_CONFIGURED || !cognitoToken) {
      setIsLoading(false);
      setIsMinted(false);
      setData(null);
      setWallets([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const res = await getAllianceStatus(cognitoToken);
      setIsMinted(res.minted);
      setData(res.data);
      setWallets(res.wallets || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check Alliance status";
      console.error("[useAllianceMintStatus]", message);
      setError(message);
      setIsMinted(false);
      setData(null);
      setWallets([]);
    } finally {
      setIsLoading(false);
    }
  }, [cognitoToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const handler = () => { fetchStatus(); };
    window.addEventListener(REFETCH_EVENT, handler);
    return () => window.removeEventListener(REFETCH_EVENT, handler);
  }, [fetchStatus]);

  return {
    isMinted,
    isLoading,
    data,
    wallets,
    error,
    isConfigured: API_CONFIGURED,
    refetch: fetchStatus,
  };
}
