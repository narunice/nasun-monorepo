/**
 * Battalion NFT Registration Hook
 *
 * @description
 * 화이트리스트 등록을 위한 React Hook
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import { useState, useCallback } from 'react';
import {
  RegisterUserRequest,
  RegisterUserResponse,
  ApiError,
} from '../types/battalion-nft';
import { registerUserApi } from '../services/battalionNftApi';

interface UseBattalionNftRegistrationReturn {
  register: (request: RegisterUserRequest) => Promise<RegisterUserResponse>;
  isLoading: boolean;
  error: ApiError | null;
  data: RegisterUserResponse | null;
  reset: () => void;
}

/**
 * Battalion NFT 화이트리스트 등록 Hook
 *
 * @example
 * const { register, isLoading, error, data } = useBattalionNftRegistration();
 *
 * const handleRegister = async () => {
 *   try {
 *     const result = await register({
 *       walletAddress: '0x...',
 *       xUserId: '123',
 *       xUsername: 'user',
 *     });
 *     console.log('Registration result:', result);
 *   } catch (err) {
 *     console.error('Registration failed:', err);
 *   }
 * };
 */
export function useBattalionNftRegistration(): UseBattalionNftRegistrationReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [data, setData] = useState<RegisterUserResponse | null>(null);

  const register = useCallback(
    async (request: RegisterUserRequest): Promise<RegisterUserResponse> => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('[useBattalionNftRegistration] Registering:', request);

        const result = await registerUserApi(request);

        setData(result);
        console.log('[useBattalionNftRegistration] Success:', result);

        return result;
      } catch (err: unknown) {
        const apiError = err as ApiError;
        setError(apiError);

        console.error('[useBattalionNftRegistration] Error:', apiError);
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
    register,
    isLoading,
    error,
    data,
    reset,
  };
}
