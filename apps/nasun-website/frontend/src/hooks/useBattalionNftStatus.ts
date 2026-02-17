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
import { useTranslation } from 'react-i18next';
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
  walletAddress: string | null | undefined,
  xUserId?: string | null,
): UseBattalionNftStatusReturn {
  const [status, setStatus] = useState<NftWhitelist | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation('battalion-nft');

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
        setIsRegistered(response.registered);
        setStatus(response.data);
      } else {
        setError(response.message || 'Failed to check Battalion NFT status');
        setIsRegistered(false);
        setStatus(null);
      }
    } catch (err: unknown) {
      console.error('[useBattalionNftStatus] Error:', err);

      // Map error codes to i18n translations
      if ((err as ApiError).code) {
        const apiError = err as ApiError;
        const errorCode = apiError.code;
        const i18nKey = `errors.${errorCode}`;
        const translated = t(i18nKey) !== i18nKey ? t(i18nKey) : null;
        setError(translated || t('errors.networkError'));
      } else {
        setError(t('errors.networkError'));
      }

      setIsRegistered(false);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, xUserId, t]);

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
