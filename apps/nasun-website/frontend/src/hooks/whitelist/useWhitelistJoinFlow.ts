import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { WhitelistModalData } from '../../types/whitelist';

interface UseWhitelistJoinFlowOptions {
  onSuccess?: (walletAddress: string) => void;
  onError?: (error: Error) => void;
}

interface UseWhitelistJoinFlowReturn {
  isModalOpen: boolean;
  modalData: WhitelistModalData;
  openModal: () => void;
  closeModal: (open: boolean) => void;
  handleProceed: () => Promise<void>;
  handleWithdraw: () => Promise<void>;
}

const shortenAddress = (address: string): string => {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export function useWhitelistJoinFlow(
  options?: UseWhitelistJoinFlowOptions
): UseWhitelistJoinFlowReturn {
  const { t } = useTranslation(['myAccount', 'common']);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<WhitelistModalData>({
    state: 'idle',
  });

  const { user } = useAuth();
  const { user: userProfile, updateUserProfile } = useUserStore();

  const registeredEthAddress =
    user?.provider === 'MetaMask'
      ? user.walletAddress
      : userProfile?.linkedAccounts?.metamask?.walletAddress;

  const autoLinkWallet = useCallback(async (walletAddress: string) => {
    if (!user?.identityId) {
      console.log('[JoinWhitelist] No user identityId, skipping auto-link');
      return;
    }

    try {
      console.log('[JoinWhitelist] Auto-linking wallet to profile...');

      const expectedChainId = import.meta.env.VITE_ETHEREUM_CHAIN_ID;
      if (expectedChainId) {
        await switchNetwork(expectedChainId);
      }

      const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
        return await signMessage(message, walletAddress);
      });

      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) {
        console.warn('[JoinWhitelist] VITE_LINK_ACCOUNT_API not configured, skipping link');
        return;
      }

      const linkHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.cognitoToken) {
        linkHeaders['Authorization'] = `Bearer ${user.cognitoToken}`;
      }

      const response = await fetch(`${linkAccountApi}/link`, {
        method: 'POST',
        headers: linkHeaders,
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

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      if (userProfileApi) {
        const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);
        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          updateUserProfile(updatedProfile);
          sessionStorage.setItem('nasun_user_profile', JSON.stringify(updatedProfile));
        }
      }

      console.log('[JoinWhitelist] Wallet auto-linked successfully');
    } catch (error) {
      console.warn('[JoinWhitelist] Auto-link failed (non-blocking):', error);
    }
  }, [user?.identityId, updateUserProfile]);

  const openModal = useCallback(() => {
    setModalData({ state: 'intro' });
    setModalOpen(true);
  }, []);

  const closeModal = useCallback((open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setTimeout(() => {
        setModalData({ state: 'idle' });
      }, 200);
    }
  }, []);

  const handleProceed = useCallback(async () => {
    if (!isMetaMaskInstalled()) {
      setModalData({
        state: 'error',
        error: t('common:wallet.metamask_not_installed'),
        errorCode: 'NO_METAMASK',
      });
      return;
    }

    try {
      setModalData({ state: 'connecting' });

      const walletAddress = await connectWallet();
      const normalizedAddress = walletAddress.toLowerCase();
      console.log('Connected wallet:', walletAddress);

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

      setModalData({ state: 'signing', walletAddress });

      const response = await joinWhitelistWithSignature(walletAddress, (message) =>
        signMessage(message, walletAddress)
      );

      if (!registeredEthAddress && user?.identityId) {
        autoLinkWallet(normalizedAddress);
      }

      setModalData({
        state: 'success',
        walletAddress,
        joinedAt: response.data.joinedAt,
      });

      options?.onSuccess?.(walletAddress);
    } catch (error: unknown) {
      console.error('Join whitelist error:', error);

      const metamaskErrorType = getMetaMaskErrorType(error);

      if (error instanceof WhitelistApiError) {
        if (error.statusCode === 409) {
          setModalData((prev) => ({
            state: 'already_joined',
            walletAddress: prev.walletAddress,
            error: error.message,
          }));
          return;
        }

        setModalData((prev) => ({
          state: 'error',
          walletAddress: prev.walletAddress,
          error: error.message,
          errorCode: error.errorCode,
        }));
        return;
      }

      if (metamaskErrorType === 'USER_REJECTED') {
        setModalData((prev) => ({
          state: 'error',
          walletAddress: prev.walletAddress,
          error: 'You rejected the signature request.',
          errorCode: 'USER_REJECTED',
        }));
        return;
      }

      setModalData((prev) => ({
        state: 'error',
        walletAddress: prev.walletAddress,
        error: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.',
        errorCode: 'UNKNOWN',
      }));
    }
  }, [t, registeredEthAddress, user?.identityId, autoLinkWallet, options]);

  const handleWithdraw = useCallback(async () => {
    console.log('[DEBUG] handleWithdraw called, modalData:', modalData);

    if (!modalData.walletAddress) {
      console.error('No wallet address available for withdrawal');
      return;
    }

    console.log('[DEBUG] Wallet address confirmed:', modalData.walletAddress);

    try {
      console.log('[DEBUG] Setting state to signing...');
      setModalData((prev) => ({
        ...prev,
        state: 'signing',
      }));

      console.log('[DEBUG] Calling withdrawWhitelistWithSignature...');
      const response = await withdrawWhitelistWithSignature(
        modalData.walletAddress,
        (message) => {
          console.log('[DEBUG] signMessage callback invoked with message length:', message.length);
          return signMessage(message, modalData.walletAddress!);
        }
      );
      console.log('[DEBUG] withdrawWhitelistWithSignature completed:', response);

      console.log('Withdrawn successfully:', response);
      setModalOpen(false);
      setModalData({ state: 'idle' });

      alert(`${t('myAccount:whitelist.modal.withdrawSuccess.message')}\n\n${t('myAccount:whitelist.modal.withdrawSuccess.wallet')}: ${modalData.walletAddress}`);
    } catch (error: unknown) {
      console.error('Withdraw whitelist error:', error);

      if (error instanceof WhitelistApiError && error.errorCode === 'ALREADY_WITHDRAWN') {
        setModalData({
          state: 'already_withdrawn',
          walletAddress: modalData.walletAddress,
        });
        return;
      }

      const metamaskErrorType = getMetaMaskErrorType(error);
      if (metamaskErrorType === 'USER_REJECTED') {
        setModalData((prev) => ({
          ...prev,
          state: prev.state === 'success' ? 'success' : 'already_joined',
        }));
        return;
      }

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
  }, [modalData, t]);

  return {
    isModalOpen: modalOpen,
    modalData,
    openModal,
    closeModal,
    handleProceed,
    handleWithdraw,
  };
}
