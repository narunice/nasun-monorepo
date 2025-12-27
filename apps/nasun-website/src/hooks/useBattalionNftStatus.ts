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
  walletAddress: string | null | undefined
): UseBattalionNftStatusReturn {
  const [status, setStatus] = useState<NftWhitelist | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    // 지갑 주소가 없으면 조회하지 않음
    if (!walletAddress) {
      setIsLoading(false);
      setIsRegistered(false);
      setStatus(null);
      setError(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await checkBattalionNftStatus(walletAddress);

      if (response.success) {
        setIsRegistered(response.registered);
        setStatus(response.data);
      } else {
        setError(response.message || 'Failed to check Battalion NFT status');
        setIsRegistered(false);
        setStatus(null);
      }
    } catch (err: unknown) {
      console.error('[useBattalionNftStatus] Error:', err);

      // ApiError 타입 확인
      if ((err as ApiError).code) {
        const apiError = err as ApiError;
        setError(apiError.message || apiError.error);
      } else {
        setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      }

      setIsRegistered(false);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  // 지갑 주소가 변경될 때마다 자동으로 상태 조회
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    isRegistered,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
