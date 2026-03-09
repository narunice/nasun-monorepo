/**
 * useGenesisNftStatus Hook
 *
 * @description
 * Genesis NFT Allowlist 등록 상태를 조회하는 React Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { checkGenesisNftStatus } from '../services/genesisNftApi';
import { NftWhitelist, ApiError } from '../types/genesis-nft';
import { useGenesisNftStore } from '../stores/useGenesisNftStore';

const ERROR_MESSAGES: Record<string, string> = {
  ALREADY_REGISTERED: "This wallet address is already registered.",
  X_ACCOUNT_ALREADY_REGISTERED: "This X account is already registered with a different wallet address.",
  INVALID_WALLET_ADDRESS: "Invalid wallet address.",
  INVALID_X_USER_ID: "Invalid X user ID.",
  INVALID_X_USERNAME: "Invalid X username.",
  MISSING_REQUIRED_FIELDS: "Missing required fields.",
  NOT_ELIGIBLE: "You are not eligible for this event.",
  TASKS_NOT_COMPLETED: "Please complete all required tasks first.",
  X_API_ERROR: "X API error. Please try again later.",
  X_API_RATE_LIMIT: "X API rate limit reached. Please try again later.",
  RATE_LIMIT_EXCEEDED: "Too many requests. Please try again later.",
  UNKNOWN_ERROR: "An unknown error occurred. Please try again.",
  INVALID_SIGNATURE: "Invalid wallet signature. Please try again.",
  SIGNATURE_EXPIRED: "Signature expired. Please try again.",
  ALREADY_MINTED: "This X account has already minted an NFT. Wallet changes are no longer allowed.",
  networkError: "A network error occurred. Please try again later.",
  statusCheckError: "An error occurred while checking status.",
};

const FALLBACK_ERROR = "A network error occurred. Please try again later.";

interface UseGenesisNftStatusReturn {
  status: NftWhitelist | null;
  isRegistered: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGenesisNftStatus(
  walletAddress: string | null | undefined,
  xUserId?: string | null,
): UseGenesisNftStatusReturn {
  const [status, setStatus] = useState<NftWhitelist | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusVersion = useGenesisNftStore((s) => s.statusVersion);

  const fetchStatus = useCallback(async () => {
    if (!walletAddress && !xUserId) {
      setIsLoading(false);
      setIsRegistered(false);
      setStatus(null);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await checkGenesisNftStatus(walletAddress || undefined, xUserId || undefined);

      if (response.success) {
        setIsRegistered(response.registered);
        setStatus(response.data);
      } else {
        setError(response.message || 'Failed to check Genesis NFT status');
        setIsRegistered(false);
        setStatus(null);
      }
    } catch (err: unknown) {
      console.error('[useGenesisNftStatus] Error:', err);

      if ((err as ApiError).code) {
        const errorCode = (err as ApiError).code;
        setError(ERROR_MESSAGES[errorCode] ?? FALLBACK_ERROR);
      } else {
        setError(FALLBACK_ERROR);
      }

      setIsRegistered(false);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, xUserId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus, statusVersion]);

  return {
    status,
    isRegistered,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
