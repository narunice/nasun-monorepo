import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '../../store/userStore';
import { useBattalionNftStore } from '../../stores/useBattalionNftStore';
import logger from '../../lib/logger';
import { authenticateWithMetaMask } from '../../services/metamaskApi';
import { connectWallet, signMessage, isMetaMaskInstalled, isCorrectNetwork, switchNetwork } from '../../utils/metamaskUtils';

interface AccountLinkingProps {
  onLinkSuccess?: () => void;
}

export const AccountLinking: React.FC<AccountLinkingProps> = ({ onLinkSuccess }) => {
  const { t } = useTranslation(['myAccount', 'common']);
  const user = useUserStore((state) => state.user);
  const updateUserProfile = useUserStore((state) => state.updateUserProfile);
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  // Determine which account is primary and which are linked
  const hasGoogleLinked = !!user.linkedAccounts?.google;
  const hasTwitterLinked = !!user.linkedAccounts?.twitter;
  const hasMetaMaskLinked = !!user.linkedAccounts?.metamask;

  // If user has Google linked, they logged in with Twitter (and vice versa)
  const isGooglePrimary = user.provider === 'Google' && !hasGoogleLinked;
  const isTwitterPrimary = user.provider === 'Twitter' && !hasTwitterLinked;
  const isMetaMaskPrimary = user.provider === 'MetaMask' && !hasMetaMaskLinked;

  // MetaMask feature flag
  const isMetaMaskEnabled = import.meta.env.VITE_ENABLE_METAMASK_LOGIN === 'true';
  const expectedChainId = parseInt(import.meta.env.VITE_ETHEREUM_CHAIN_ID || '1', 10);

  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setError(null);

    try {
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = `${window.location.origin}/callback`;

      if (!googleClientId) {
        throw new Error('Google Client ID is not configured');
      }

      // Store linking session info
      sessionStorage.setItem('google_link_session', JSON.stringify({
        primaryIdentityId: user.identityId,
        isLinking: true,
      }));

      // Set provider preference for OAuth redirect handling
      localStorage.setItem('auth_provider_preference', 'Google');

      // Build Google OAuth URL (same as signInWithGoogle)
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.append('client_id', googleClientId);
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('response_type', 'id_token');
      authUrl.searchParams.append('scope', 'openid email profile');
      authUrl.searchParams.append('nonce', Math.random().toString(36).substring(2));
      authUrl.searchParams.append('prompt', 'select_account');

      logger.log('Starting Google linking with URL:', authUrl.toString());
      window.location.href = authUrl.toString();
    } catch (err: unknown) {
      logger.error('Failed to start Google linking:', err);
      setError(err instanceof Error ? err.message : 'Failed to link Google account');
      setIsLinking(false);
    }
  };

  const handleLinkTwitter = async () => {
    setIsLinking(true);
    setError(null);

    try {
      const twitterAuthApi = import.meta.env.VITE_TWITTER_AUTH_API;
      if (!twitterAuthApi) {
        throw new Error('Twitter Auth API is not configured');
      }

      // Call Twitter Auth API to get authorization URL
      const response = await fetch(`${twitterAuthApi}/login?link=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to initialize Twitter OAuth');
      }

      const data = await response.json();

      // Store session info for linking flow
      sessionStorage.setItem('twitter_link_session', JSON.stringify({
        sessionId: data.sessionId,
        state: data.state,
        primaryIdentityId: user.identityId,
      }));

      // Set provider preference for OAuth redirect handling
      localStorage.setItem('auth_provider_preference', 'Twitter');

      // Redirect to Twitter authorization
      window.location.href = data.authUrl;
    } catch (err: unknown) {
      logger.error('Failed to start Twitter linking:', err);
      setError(err instanceof Error ? err.message : 'Failed to link Twitter account');
      setIsLinking(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    if (!confirm(t('userInfo.confirmUnlinkGoogle') || 'Are you sure you want to unlink your Google account?')) {
      return;
    }

    setIsLinking(true);
    setError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) {
        throw new Error('Link Account API is not configured');
      }

      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          provider: 'google',
        }),
      });

      if (!response.ok) {
        throw new Error(t('userInfo.unlinkGoogleError') || 'Failed to unlink Google account');
      }

      // Fetch updated profile from server
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedProfile));
        logger.log('Google account unlinked successfully');
      } else {
        throw new Error('Failed to fetch updated profile');
      }

      alert(t('userInfo.unlinkGoogleSuccess') || 'Google account unlinked successfully!');
      onLinkSuccess?.();
    } catch (err: unknown) {
      logger.error('Failed to unlink Google account:', err);
      setError(err instanceof Error ? err.message : (t('userInfo.unlinkGoogleError') || 'Failed to unlink Google account'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkTwitter = async () => {
    if (!confirm(t('userInfo.confirmUnlinkTwitter') || 'Are you sure you want to unlink your Twitter account?')) {
      return;
    }

    setIsLinking(true);
    setError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) {
        throw new Error('Link Account API is not configured');
      }

      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          provider: 'twitter',
        }),
      });

      if (!response.ok) {
        throw new Error(t('userInfo.unlinkTwitterError') || 'Failed to unlink Twitter account');
      }

      // Fetch updated profile from server
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedProfile));
        logger.log('Twitter account unlinked successfully');
      } else {
        throw new Error('Failed to fetch updated profile');
      }

      alert(t('userInfo.unlinkTwitterSuccess') || 'Twitter account unlinked successfully!');
      onLinkSuccess?.();
    } catch (err: unknown) {
      logger.error('Failed to unlink Twitter account:', err);
      setError(err instanceof Error ? err.message : (t('userInfo.unlinkTwitterError') || 'Failed to unlink Twitter account'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleLinkMetaMask = async () => {
    setIsLinking(true);
    setError(null);

    try {
      // 1. Check MetaMask installation
      if (!isMetaMaskInstalled()) {
        throw new Error('MetaMask is not installed. Please install MetaMask extension.');
      }

      // 2. Connect wallet
      const walletAddress = await connectWallet();
      logger.log('Connected wallet:', walletAddress);

      // 3. Check network
      const correctNetwork = await isCorrectNetwork(expectedChainId);
      if (!correctNetwork) {
        await switchNetwork(expectedChainId);
      }

      // 4. Authenticate with MetaMask
      const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
        return await signMessage(message, walletAddress);
      });

      logger.log('MetaMask auth successful:', authResult);

      // 5. Link accounts
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) {
        throw new Error('Link Account API is not configured');
      }

      const linkResponse = await fetch(linkAccountApi, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          secondaryIdentityId: authResult.identityId,
          secondaryProvider: 'MetaMask',
        }),
      });

      if (!linkResponse.ok) {
        throw new Error('Failed to link MetaMask account');
      }

      // 6. Fetch updated profile
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedProfile));
        logger.log('MetaMask account linked successfully');
      } else {
        throw new Error('Failed to fetch updated profile');
      }

      onLinkSuccess?.();
    } catch (err: unknown) {
      logger.error('Failed to link MetaMask account:', err);
      setError(err instanceof Error ? err.message : 'Failed to link MetaMask account');
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkMetaMask = async () => {
    if (!confirm(t('userInfo.confirmUnlinkMetaMask') || 'Are you sure you want to unlink your MetaMask wallet? You will need to sign a message to confirm.')) {
      return;
    }

    setIsLinking(true);
    setError(null);

    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) {
        throw new Error('Link Account API is not configured');
      }

      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          primaryIdentityId: user.identityId,
          provider: 'metamask',
        }),
      });

      if (!response.ok) {
        throw new Error(t('userInfo.unlinkMetaMaskError') || 'Failed to unlink MetaMask wallet');
      }

      // Fetch updated profile from server
      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user.identityId}`);

      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedProfile));
        logger.log('MetaMask account unlinked successfully');

        // ✅ Clear Battalion NFT store and localStorage (강화된 버전)
        const { reset: resetBattalionNftStore } = useBattalionNftStore.getState();

        // Step 1: Store reset 호출
        resetBattalionNftStore();
        logger.log('[AccountLinking] Battalion NFT store reset called');

        // Step 2: localStorage 강제 제거 (동기)
        localStorage.removeItem('battalion-nft-state');
        logger.log('[AccountLinking] localStorage removed (sync)');

        // Step 3: 비동기 후속 제거 (브라우저 캐싱 방지)
        setTimeout(() => {
          localStorage.removeItem('battalion-nft-state');
          logger.log('[AccountLinking] localStorage removed (async fallback)');
        }, 100);
      } else {
        throw new Error('Failed to fetch updated profile');
      }

      alert(t('userInfo.unlinkMetaMaskSuccess') || 'MetaMask wallet unlinked successfully!');
      onLinkSuccess?.();
    } catch (err: unknown) {
      logger.error('Failed to unlink MetaMask account:', err);
      setError(err instanceof Error ? err.message : (t('userInfo.unlinkMetaMaskError') || 'Failed to unlink MetaMask wallet'));
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">
        Linked Accounts
      </h3>

      {error && (
        <div className="p-3 bg-red-900 text-red-200 rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {/* Google Account */}
        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-white">Google</p>
              {isGooglePrimary && user.email && (
                <p className="text-sm text-gray-400">
                  {user.email}
                </p>
              )}
              {hasGoogleLinked && user.linkedAccounts?.google && (
                <p className="text-sm text-gray-400">
                  {user.linkedAccounts.google.email || user.linkedAccounts.google.username}
                </p>
              )}
            </div>
          </div>
          <div>
            {isGooglePrimary ? (
              <span className="px-3 py-1 bg-green-900 text-green-200 rounded-lg text-sm">
                Primary
              </span>
            ) : hasGoogleLinked ? (
              <button
                onClick={handleUnlinkGoogle}
                disabled={isLinking}
                className="px-4 py-2 bg-red-900 text-red-200 rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinking ? 'Unlinking...' : 'Unlink'}
              </button>
            ) : (
              <button
                onClick={handleLinkGoogle}
                disabled={isLinking}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinking ? 'Linking...' : 'Link'}
              </button>
            )}
          </div>
        </div>

        {/* Twitter Account */}
        <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
              <span className="text-white text-xl font-bold">𝕏</span>
            </div>
            <div>
              <p className="font-medium text-white">X (Twitter)</p>
              {isTwitterPrimary && user.twitterHandle && (
                <p className="text-sm text-gray-400">
                  @{user.twitterHandle}
                </p>
              )}
              {hasTwitterLinked && user.linkedAccounts?.twitter && (
                <p className="text-sm text-gray-400">
                  @{user.linkedAccounts.twitter.twitterHandle || user.linkedAccounts.twitter.username}
                </p>
              )}
            </div>
          </div>
          <div>
            {isTwitterPrimary ? (
              <span className="px-3 py-1 bg-green-900 text-green-200 rounded-lg text-sm">
                Primary
              </span>
            ) : hasTwitterLinked ? (
              <button
                onClick={handleUnlinkTwitter}
                disabled={isLinking}
                className="px-4 py-2 bg-red-900 text-red-200 rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinking ? 'Unlinking...' : 'Unlink'}
              </button>
            ) : (
              <button
                onClick={handleLinkTwitter}
                disabled={isLinking}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinking ? 'Linking...' : 'Link'}
              </button>
            )}
          </div>
        </div>

        {/* MetaMask Account */}
        {isMetaMaskEnabled && (
          <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                  <path d="M21.5 12C21.5 17.2467 17.2467 21.5 12 21.5C6.75329 21.5 2.5 17.2467 2.5 12C2.5 6.75329 6.75329 2.5 12 2.5C17.2467 2.5 21.5 6.75329 21.5 12Z" fill="#F6851B"/>
                  <path d="M12 18L9 15L12 13L15 15L12 18Z" fill="white"/>
                  <path d="M12 6L15 9L12 11L9 9L12 6Z" fill="white"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-white">MetaMask</p>
                {isMetaMaskPrimary && user.walletAddress && (
                  <p className="text-sm text-gray-400 font-mono">
                    {user.walletAddress.substring(0, 6)}...{user.walletAddress.substring(38)}
                  </p>
                )}
                {hasMetaMaskLinked && user.linkedAccounts?.metamask && (
                  <p className="text-sm text-gray-400 font-mono">
                    {user.linkedAccounts.metamask.walletAddress?.substring(0, 6)}...
                    {user.linkedAccounts.metamask.walletAddress?.substring(38)}
                  </p>
                )}
              </div>
            </div>
            <div>
              {isMetaMaskPrimary ? (
                <span className="px-3 py-1 bg-green-900 text-green-200 rounded-lg text-sm">
                  Primary
                </span>
              ) : hasMetaMaskLinked ? (
                <button
                  onClick={handleUnlinkMetaMask}
                  disabled={isLinking}
                  className="px-4 py-2 bg-red-900 text-red-200 rounded-lg hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLinking ? 'Unlinking...' : 'Unlink'}
                </button>
              ) : (
                <button
                  onClick={handleLinkMetaMask}
                  disabled={isLinking}
                  className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLinking ? 'Linking...' : 'Link Wallet'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-gray-400">
        Link your social accounts {isMetaMaskEnabled && 'and crypto wallet '} to access all features and sync your profile across platforms.
      </p>
    </div>
  );
};
