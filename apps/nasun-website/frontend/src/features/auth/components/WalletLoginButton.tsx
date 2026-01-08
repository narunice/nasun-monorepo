/**
 * MetaMask 로그인 버튼 컴포넌트
 *
 * MetaMask 지갑으로 로그인하는 독립적인 버튼 컴포넌트
 * 기존 Google/Twitter 로그인과 함께 사용 가능
 */

import { useState, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  isMetaMaskInstalled,
  connectWallet,
  signMessage,
  getChainId,
  isCorrectNetwork,
  switchNetwork,
} from '@/utils/metamaskUtils';
import { authenticateWithMetaMask } from '@/services/metamaskApi';
import type { MetaMaskAuthStatus, MetaMaskErrorType } from '@/types/metamask';
import { InlineLoading } from '@/components/ui/InlineLoading';

interface WalletLoginButtonProps {
  onSuccess?: (identityId: string, token: string, walletAddress: string) => void;
  onError?: (error: Error, errorType: MetaMaskErrorType) => void;
  className?: string;
}

const WalletLoginButton = forwardRef<HTMLButtonElement, WalletLoginButtonProps>(({
  onSuccess,
  onError,
  className = '',
}, ref) => {
  const { t } = useTranslation('common');
  const [status, setStatus] = useState<MetaMaskAuthStatus>('NOT_CONNECTED' as MetaMaskAuthStatus);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 환경변수에서 MetaMask 로그인 활성화 여부 확인
  const isMetaMaskEnabled = import.meta.env.VITE_ENABLE_METAMASK_LOGIN === 'true';
  const expectedChainId = parseInt(import.meta.env.VITE_ETHEREUM_CHAIN_ID || '1', 10);
  const networkName = import.meta.env.VITE_ETHEREUM_NETWORK_NAME || 'Ethereum';

  // Feature flag가 비활성화된 경우 버튼 숨김
  if (!isMetaMaskEnabled) {
    return null;
  }

  const handleMetaMaskLogin = async () => {
    console.log('[DEBUG] handleMetaMaskLogin called');
    setErrorMessage('');
    setStatus('CONNECTING' as MetaMaskAuthStatus);

    try {
      // 1. MetaMask 설치 확인
      console.log('[DEBUG] Checking MetaMask installation...');
      if (!isMetaMaskInstalled()) {
        throw new Error('MetaMask is not installed. Please install MetaMask browser extension.');
      }

      // 2. 지갑 연결
      console.log('[DEBUG] Connecting wallet...');
      const walletAddress = await connectWallet();
      console.log('[DEBUG] Connected wallet:', walletAddress);
      setStatus('CONNECTED' as MetaMaskAuthStatus);

      // 3. 네트워크 확인 및 전환
      console.log('[DEBUG] Checking network...');
      const correctNetwork = await isCorrectNetwork(expectedChainId);
      if (!correctNetwork) {
        const currentChainId = await getChainId();
        console.log(`Wrong network. Current: ${currentChainId}, Expected: ${expectedChainId}`);

        // 네트워크 전환 시도
        try {
          await switchNetwork(expectedChainId);
          console.log(`Switched to ${networkName} (Chain ID: ${expectedChainId})`);
        } catch (switchError: any) {
          throw new Error(
            `Please switch to ${networkName} network in MetaMask. Current network is not supported.`
          );
        }
      }

      // 4. 인증 시작
      console.log('[DEBUG] Starting authentication...');
      setStatus('AUTHENTICATING' as MetaMaskAuthStatus);

      // 5. MetaMask 인증 플로우 실행
      console.log('[DEBUG] Calling authenticateWithMetaMask...');
      const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
        // 메시지 서명 (MetaMask 팝업 표시)
        console.log('[DEBUG] authenticateWithMetaMask callback invoked, message:', message);
        return await signMessage(message, walletAddress);
      });
      console.log('[DEBUG] Authentication result:', authResult);

      console.log('Authentication successful:', authResult);
      setStatus('AUTHENTICATED' as MetaMaskAuthStatus);

      // 6. 성공 콜백 호출
      if (onSuccess) {
        onSuccess(authResult.identityId, authResult.token, walletAddress);
      }
    } catch (error: any) {
      console.error('MetaMask login failed:', error);
      setStatus('ERROR' as MetaMaskAuthStatus);

      // 사용자 친화적인 에러 메시지
      let userMessage = error.message || 'An unknown error occurred';

      if (error.message?.includes('User rejected')) {
        userMessage = 'You rejected the request. Please try again.';
      } else if (error.message?.includes('not installed')) {
        userMessage = 'MetaMask is not installed. Please install MetaMask extension.';
      } else if (error.message?.includes('network')) {
        userMessage = `Please connect to ${networkName} network in MetaMask.`;
      }

      setErrorMessage(userMessage);

      // 에러 콜백 호출
      if (onError) {
        const errorType = getErrorType(error);
        onError(error, errorType);
      }
    }
  };

  const getErrorType = (error: any): MetaMaskErrorType => {
    if (error.message?.includes('not installed')) {
      return 'NO_METAMASK' as MetaMaskErrorType;
    }
    if (error.message?.includes('rejected')) {
      return 'USER_REJECTED' as MetaMaskErrorType;
    }
    if (error.message?.includes('network')) {
      return 'WRONG_NETWORK' as MetaMaskErrorType;
    }
    if (error.message?.includes('signature')) {
      return 'SIGNATURE_FAILED' as MetaMaskErrorType;
    }
    return 'UNKNOWN' as MetaMaskErrorType;
  };

  const getButtonText = () => {
    switch (status) {
      case 'CONNECTING':
        return 'Connecting...';
      case 'CONNECTED':
        return 'Connected';
      case 'AUTHENTICATING':
        return 'Authenticating...';
      case 'AUTHENTICATED':
        return 'Authenticated!';
      case 'ERROR':
        return 'Try Again';
      default:
        return t('auth.login') + ' with MetaMask';
    }
  };

  const isLoading =
    status === ('CONNECTING' as MetaMaskAuthStatus) ||
    status === ('AUTHENTICATING' as MetaMaskAuthStatus);
  const isDisabled = isLoading || status === ('AUTHENTICATED' as MetaMaskAuthStatus);

  return (
    <>
      <button
        ref={ref}
        onClick={handleMetaMaskLogin}
        disabled={isDisabled}
        className={className}
      >
        <img
          src="/MetaMask_Fox.svg"
          alt="MetaMask"
          className="w-4 h-4 flex-shrink-0"
        />
        <span className="flex-1">{getButtonText()}</span>
        {isLoading && <InlineLoading size="sm" className="ml-auto" />}
      </button>

      {errorMessage && (
        <div className="text-sm text-red-400 px-2 py-1">{errorMessage}</div>
      )}
    </>
  );
});

WalletLoginButton.displayName = 'WalletLoginButton';

export default WalletLoginButton;
