/**
 * useMetaMaskConnection Hook
 *
 * @description
 * MetaMask 지갑 연결을 위한 통합 Hook입니다.
 * 신규 로그인(login)과 계정 연결(link) 두 가지 모드를 지원합니다.
 *
 * @author Claude Code
 * @date 2025-11-12
 */

import { useState } from 'react';
import { useAuth } from '../../providers/auth/AuthContext';
import { useUserStore } from '../../store/userStore';
import {
  connectWallet,
  switchNetwork,
  signMessage,
} from '../../utils/metamaskUtils';
import { authenticateWithMetaMask } from '../../services/metamaskApi';

export type MetaMaskConnectionMode = 'login' | 'link';

export interface UseMetaMaskConnectionOptions {
  mode: MetaMaskConnectionMode;
  onSuccess?: (address: string) => void;
  onError?: (error: Error) => void;
}

export interface UseMetaMaskConnectionReturn {
  handleConnect: () => Promise<void>;
  isConnecting: boolean;
}

/**
 * MetaMask 연결 Hook
 *
 * @param options - 연결 옵션 (mode, onSuccess, onError)
 * @returns handleConnect 함수 및 isConnecting 상태
 *
 * @example
 * // 계정 연결 모드 (Account Linking)
 * const { handleConnect, isConnecting } = useMetaMaskConnection({
 *   mode: 'link',
 *   onSuccess: (address) => console.log('Linked:', address),
 *   onError: (error) => console.error('Link failed:', error),
 * });
 *
 * @example
 * // 로그인 모드 (New Login)
 * const { handleConnect, isConnecting } = useMetaMaskConnection({
 *   mode: 'login',
 *   onSuccess: (address) => console.log('Logged in with:', address),
 * });
 */
export function useMetaMaskConnection(
  options: UseMetaMaskConnectionOptions
): UseMetaMaskConnectionReturn {
  const { mode, onSuccess, onError } = options;
  const { user, signInWithMetaMask } = useAuth();
  const updateUserProfile = useUserStore((state) => state.updateUserProfile);
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);

      // 1. MetaMask 연결
      const address = await connectWallet();

      // 2. 네트워크 확인 및 전환
      const expectedChainId = import.meta.env.VITE_ETHEREUM_CHAIN_ID;
      if (!expectedChainId) {
        throw new Error('VITE_ETHEREUM_CHAIN_ID is not configured');
      }
      await switchNetwork(expectedChainId);

      // 3. Backend 인증 (Challenge-Response)
      const authResult = await authenticateWithMetaMask(address, async (message) => {
        return await signMessage(message, address);
      });

      // 4. 모드별 분기
      if (mode === 'login') {
        // 로그인 모드: AuthContext 업데이트
        await signInWithMetaMask(
          authResult.identityId,
          authResult.token,
          address
        );
        onSuccess?.(address);
      } else {
        // 연결 모드: link-account API 호출
        if (!user) {
          throw new Error('User must be logged in to link MetaMask account');
        }

        const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
        if (!linkAccountApi) {
          throw new Error('VITE_LINK_ACCOUNT_API is not configured');
        }

        const response = await fetch(`${linkAccountApi}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            primaryIdentityId: user.identityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: 'MetaMask',
            walletAddress: address,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || 'Failed to link MetaMask account'
          );
        }

        // 프로필 갱신
        const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
        if (!userProfileApi) {
          throw new Error('VITE_USER_PROFILE_API is not configured');
        }

        const profileResponse = await fetch(
          `${userProfileApi}?identityId=${user.identityId}`
        );

        if (!profileResponse.ok) {
          throw new Error('Failed to fetch updated profile');
        }

        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem(
          'nasun_user_profile',
          JSON.stringify(updatedProfile)
        );

        onSuccess?.(address);
      }
    } catch (error) {
      console.error('[useMetaMaskConnection] Error:', error);
      onError?.(error as Error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  return {
    handleConnect,
    isConnecting,
  };
}
