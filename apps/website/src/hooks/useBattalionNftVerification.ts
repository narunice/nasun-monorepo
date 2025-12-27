/**
 * Battalion NFT Verification Hook
 *
 * @description
 * X 태스크 검증을 위한 React Hook
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import { useState, useCallback } from 'react';
import {
  VerifyEligibilityRequest,
  VerifyEligibilityResponse,
  ApiError,
} from '../types/battalion-nft';
import { verifyEligibilityApi } from '../services/battalionNftApi';

interface UseBattalionNftVerificationReturn {
  verify: (request: VerifyEligibilityRequest) => Promise<VerifyEligibilityResponse>;
  isLoading: boolean;
  error: ApiError | null;
  data: VerifyEligibilityResponse | null;
  reset: () => void;
}

/**
 * Battalion NFT 태스크 검증 Hook
 *
 * @example
 * const { verify, isLoading, error, data } = useBattalionNftVerification();
 *
 * const handleVerify = async () => {
 *   try {
 *     const result = await verify({
 *       walletAddress: '0x...',
 *       xUserId: '123',
 *       xUsername: 'user',
 *     });
 *     console.log('Verification result:', result);
 *   } catch (err) {
 *     console.error('Verification failed:', err);
 *   }
 * };
 */
export function useBattalionNftVerification(): UseBattalionNftVerificationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [data, setData] = useState<VerifyEligibilityResponse | null>(null);

  const verify = useCallback(
    async (request: VerifyEligibilityRequest): Promise<VerifyEligibilityResponse> => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('[useBattalionNftVerification] Verifying:', request);

        const result = await verifyEligibilityApi(request);

        setData(result);
        console.log('[useBattalionNftVerification] Success:', result);

        return result;
      } catch (err: unknown) {
        const apiError = err as ApiError;
        setError(apiError);

        console.error('[useBattalionNftVerification] Error:', apiError);
        throw apiError;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    verify,
    isLoading,
    error,
    data,
    reset,
  };
}
