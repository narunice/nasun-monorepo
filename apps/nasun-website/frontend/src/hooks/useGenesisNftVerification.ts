/**
 * Genesis NFT Verification Hook
 *
 * @description
 * X 태스크 검증을 위한 React Hook
 */

import { useState, useCallback } from 'react';
import {
  VerifyEligibilityRequest,
  VerifyEligibilityResponse,
  ApiError,
} from '../types/genesis-nft';
import { verifyEligibilityApi } from '../services/genesisNftApi';

interface UseGenesisNftVerificationReturn {
  verify: (request: VerifyEligibilityRequest) => Promise<VerifyEligibilityResponse>;
  isLoading: boolean;
  error: ApiError | null;
  data: VerifyEligibilityResponse | null;
  reset: () => void;
}

export function useGenesisNftVerification(): UseGenesisNftVerificationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [data, setData] = useState<VerifyEligibilityResponse | null>(null);

  const verify = useCallback(
    async (request: VerifyEligibilityRequest): Promise<VerifyEligibilityResponse> => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('[useGenesisNftVerification] Verifying:', request);

        const result = await verifyEligibilityApi(request);

        setData(result);
        console.log('[useGenesisNftVerification] Success:', result);

        return result;
      } catch (err: unknown) {
        const apiError = err as ApiError;
        setError(apiError);

        console.error('[useGenesisNftVerification] Error:', apiError);
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
