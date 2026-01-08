/**
 * Join Whitelist Button Component
 *
 * Genesis NFT Whitelist에 등록하는 버튼 컴포넌트
 * MetaMask 연결 → 서명 → API 호출 → 모달 표시
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { WhitelistModal } from './WhitelistModal';
import {
  connectWallet,
  signMessage,
  isMetaMaskInstalled,
  getMetaMaskErrorType,
  switchNetwork,
} from '../../utils/metamaskUtils';
import {
  joinWhitelistWithSignature,
  withdrawWhitelistWithSignature,
  checkWhitelistStatus,
  WhitelistApiError,
} from '../../services/whitelistApi';
import { authenticateWithMetaMask } from '../../services/metamaskApi';
import { useAuth } from "@/features/auth";
import { useUserStore } from '../../store/userStore';
import type {
  JoinWhitelistButtonProps,
  WhitelistModalData,
} from '../../types/whitelist';

// Helper to shorten address for display
const shortenAddress = (address: string): string => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * JoinWhitelistButton Component
 */
export function JoinWhitelistButton({
  className,
  variant = 'default',
  size = 'default',
  onSuccess,
  children,
}: JoinWhitelistButtonProps) {
  const { t } = useTranslation(['myAccount', 'common']);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<WhitelistModalData>({
    state: 'idle',
  });

  // User profile for wallet address comparison
  const { user } = useAuth();
  const { user: userProfile, updateUserProfile } = useUserStore();

  // Get registered MetaMask address from user profile
  const registeredEthAddress =
    user?.provider === 'MetaMask'
      ? user.walletAddress
      : userProfile?.linkedAccounts?.metamask?.walletAddress;

  /**
   * Join 버튼 클릭 - 안내 모달 표시
   */
  const handleJoinClick = () => {
    // 안내 화면 (intro) 표시
    setModalData({ state: 'intro' });
    setModalOpen(true);
  };

  /**
   * Auto-link MetaMask wallet to user profile
   */
  const autoLinkWallet = async (walletAddress: string) => {
    if (!user?.identityId) {
      console.log('[JoinWhitelist] No user identityId, skipping auto-link');
      return;
    }

    try {
      console.log('[JoinWhitelist] Auto-linking wallet to profile...');

      // 1. Network switch (if needed)
      const expectedChainId = import.meta.env.VITE_ETHEREUM_CHAIN_ID;
      if (expectedChainId) {
        await switchNetwork(expectedChainId);
      }

      // 2. Challenge-Response authentication
      const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
        return await signMessage(message, walletAddress);
      });

      // 3. Link Account API call
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) {
        console.warn('[JoinWhitelist] VITE_LINK_ACCOUNT_API not configured, skipping link');
        return;
      }

      const response = await fetch(`${linkAccountApi}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          secondaryIdentityId: authResult.identityId,
          secondaryProvider: 'MetaMask',
          walletAddress: walletAddress.toLowerCase(),
        }),
      });

      if (!response.ok) {
        console.warn('[JoinWhitelist] Failed to link wallet:', await response.text());
        return;
      }

      // 4. Refresh user profile
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      if (userProfileApi) {
        const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);
        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          updateUserProfile(updatedProfile);
          localStorage.setItem('nasun_user_profile', JSON.stringify(updatedProfile));
        }
      }

      console.log('[JoinWhitelist] Wallet auto-linked successfully');
    } catch (error) {
      // Auto-link failure should not block whitelist registration
      console.warn('[JoinWhitelist] Auto-link failed (non-blocking):', error);
    }
  };

  /**
   * Proceed 버튼 클릭 - MetaMask 연결 및 등록 플로우 실행
   *
   * Flow:
   * 1. If wallet registered in profile but different address → error
   * 2. If wallet not registered → register whitelist + auto-link
   * 3. If wallet registered and same address → register whitelist only
   */
  const handleProceed = async () => {
    // 1. MetaMask 설치 확인
    if (!isMetaMaskInstalled()) {
      setModalData({
        state: 'error',
        error: t('common:wallet.metamask_not_installed'),
        errorCode: 'NO_METAMASK',
      });
      return;
    }

    try {
      // 2. 연결 중 상태로 변경
      setModalData({ state: 'connecting' });

      // 3. MetaMask 지갑 연결
      const walletAddress = await connectWallet();
      const normalizedAddress = walletAddress.toLowerCase();
      console.log('Connected wallet:', walletAddress);

      // 4. Check if connected wallet matches profile wallet (if exists)
      if (registeredEthAddress && normalizedAddress !== registeredEthAddress.toLowerCase()) {
        setModalData({
          state: 'error',
          walletAddress,
          error:
            `The connected wallet does not match the wallet linked to your profile.\n\n` +
            `Profile wallet: ${shortenAddress(registeredEthAddress)}\n` +
            `Connected wallet: ${shortenAddress(walletAddress)}`,
          errorCode: 'WALLET_MISMATCH',
        });
        return;
      }

      // 5. 이미 등록되었는지 확인
      setModalData({ state: 'connecting', walletAddress });

      const statusResponse = await checkWhitelistStatus(walletAddress);
      if (statusResponse.data.registered) {
        setModalData({
          state: 'already_joined',
          walletAddress,
          joinedAt: statusResponse.data.joinedAt,
        });
        return;
      }

      // 6. 서명 요청
      setModalData({ state: 'signing', walletAddress });

      const response = await joinWhitelistWithSignature(walletAddress, (message) =>
        signMessage(message, walletAddress)
      );

      // 7. Auto-link wallet if not already registered in profile
      if (!registeredEthAddress && user?.identityId) {
        // Don't await - run in background to not block success display
        autoLinkWallet(normalizedAddress);
      }

      // 8. 성공
      setModalData({
        state: 'success',
        walletAddress,
        joinedAt: response.data.joinedAt,
      });

      // 9. Call onSuccess callback if provided
      onSuccess?.(walletAddress);
    } catch (error: unknown) {
      console.error('Join whitelist error:', error);

      // MetaMask 에러 처리
      const metamaskErrorType = getMetaMaskErrorType(error);

      // Whitelist API 에러 처리
      if (error instanceof WhitelistApiError) {
        if (error.statusCode === 409) {
          // 409: Already registered
          setModalData({
            state: 'already_joined',
            walletAddress: modalData.walletAddress,
            error: error.message,
          });
          return;
        }

        setModalData({
          state: 'error',
          walletAddress: modalData.walletAddress,
          error: error.message,
          errorCode: error.errorCode,
        });
        return;
      }

      // 사용자가 거부한 경우
      if (metamaskErrorType === 'USER_REJECTED') {
        setModalData({
          state: 'error',
          walletAddress: modalData.walletAddress,
          error: 'You rejected the signature request.',
          errorCode: 'USER_REJECTED',
        });
        return;
      }

      // 기타 에러
      setModalData({
        state: 'error',
        walletAddress: modalData.walletAddress,
        error: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
        errorCode: 'UNKNOWN',
      });
    }
  };

  /**
   * Withdraw Whitelist 플로우 실행
   */
  const handleWithdraw = async () => {
    console.log('[DEBUG] handleWithdraw called, modalData:', modalData);

    if (!modalData.walletAddress) {
      console.error('No wallet address available for withdrawal');
      return;
    }

    console.log('[DEBUG] Wallet address confirmed:', modalData.walletAddress);

    try {
      // 서명 요청 상태로 변경
      console.log('[DEBUG] Setting state to signing...');
      setModalData({
        ...modalData,
        state: 'signing',
      });

      console.log('[DEBUG] Calling withdrawWhitelistWithSignature...');
      const response = await withdrawWhitelistWithSignature(
        modalData.walletAddress,
        (message) => {
          console.log('[DEBUG] signMessage callback invoked with message length:', message.length);
          return signMessage(message, modalData.walletAddress!);
        }
      );
      console.log('[DEBUG] withdrawWhitelistWithSignature completed:', response);

      // 성공 시 모달 닫기
      console.log('Withdrawn successfully:', response);
      setModalOpen(false);
      setModalData({ state: 'idle' });

      // 사용자에게 알림 (옵션)
      alert(`${t('myAccount:whitelist.modal.withdrawSuccess.message')}\n\n${t('myAccount:whitelist.modal.withdrawSuccess.wallet')}: ${modalData.walletAddress}`);
    } catch (error: unknown) {
      console.error('Withdraw whitelist error:', error);

      // 이미 철회된 경우 처리
      if (error instanceof WhitelistApiError && error.errorCode === 'ALREADY_WITHDRAWN') {
        setModalData({
          state: 'already_withdrawn',
          walletAddress: modalData.walletAddress,
        });
        return;
      }

      // 사용자가 거부한 경우
      const metamaskErrorType = getMetaMaskErrorType(error);
      if (metamaskErrorType === 'USER_REJECTED') {
        // 원래 상태로 되돌림
        setModalData({
          ...modalData,
          state: modalData.state === 'success' ? 'success' : 'already_joined',
        });
        return;
      }

      // 에러 상태로 변경
      setModalData({
        state: 'error',
        walletAddress: modalData.walletAddress,
        error:
          error instanceof WhitelistApiError
            ? error.message
            : 'Failed to withdraw from whitelist. Please try again.',
        errorCode: error instanceof WhitelistApiError ? error.errorCode : 'UNKNOWN',
      });
    }
  };

  /**
   * 모달 닫기 핸들러
   */
  const handleModalClose = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      // 모달이 닫힐 때 상태 초기화
      setTimeout(() => {
        setModalData({ state: 'idle' });
      }, 200); // 애니메이션 시간 후 초기화
    }
  };

  return (
    <>
      <Button
        onClick={handleJoinClick}
        className={className}
        variant={variant}
        size={size}
      >
        {children || t('myAccount:whitelist.join')}
      </Button>

      <WhitelistModal
        open={modalOpen}
        onOpenChange={handleModalClose}
        modalData={modalData}
        onWithdraw={handleWithdraw}
        onProceed={handleProceed}
      />
    </>
  );
}
