/**
 * useBattalionNftStatus Hook
 *
 * @description
 * Battalion NFT Allowlist 등록 상태를 조회하는 React Hook
 *
 * @author Claude Code
 * @date 2025-10-27
 */

import { useState, useEffect, useCallback } from 'react';
import { checkBattalionNftStatus } from '../services/battalionNftApi';
import { NftWhitelist, ApiError } from '../types/battalion-nft';
import { useBattalionNftStore } from '../stores/useBattalionNftStore';

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

interface UseBattalionNftStatusReturn {
  status: NftWhitelist | null;
  isRegistered: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Battalion NFT 등록 상태 조회 Hook
 *
 * @param walletAddress - MetaMask 지갑 주소 (null/undefined면 조회하지 않음)
 * @returns 등록 상태 및 관련 메서드
 */
export function useBattalionNftStatus(
  walletAddress: string | null | undefined,
  xUserId?: string | null,
): UseBattalionNftStatusReturn {
  const [status, setStatus] = useState<NftWhitelist | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusVersion = useBattalionNftStore((s) => s.statusVersion);

  const fetchStatus = useCallback(async () => {
    // Neither walletAddress nor xUserId — nothing to query
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

      const response = await checkBattalionNftStatus(walletAddress || undefined, xUserId || undefined);

      if (response.success) {
        // With upsert support, the registered wallet may differ from the profile wallet
        // (user changed wallets via Battalion NFT Step 4). The xUserId is the identity
        // anchor, so a record found by xUserId is valid regardless of wallet match.
        setIsRegistered(response.registered);
        setStatus(response.data);
      } else {
        setError(response.message || 'Failed to check Battalion NFT status');
        setIsRegistered(false);
        setStatus(null);
      }
    } catch (err: unknown) {
      console.error('[useBattalionNftStatus] Error:', err);

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

  // Refetch when params change or when statusVersion is bumped (e.g. after withdraw)
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
