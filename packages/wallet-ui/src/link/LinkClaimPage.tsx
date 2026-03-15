/**
 * Link Claim Page Component
 *
 * Allows recipients to claim tokens from a Nasun Link.
 * Supports both connected wallets and zkLogin for new users.
 */

import { useState, useCallback } from 'react';
import {
  useClaimFromUrl,
  useLinkStatus,
  useLinkBalance,
  useWallet,
  useZkLogin,
  usePasskey,
} from '@nasun/wallet';
import type { LinkData, ZkLoginProvider } from '@nasun/wallet';
import { SocialLoginButtons } from '../social/SocialLoginButtons';

export interface LinkClaimPageProps {
  /** Link URL (full URL including secret) */
  linkUrl: string;
  /** Link data (fetched from storage/API) */
  linkData: LinkData | null;
  /** Loading state for link data */
  isLoadingLinkData?: boolean;
  /** Error loading link data */
  linkDataError?: string | null;
  /** Callback on successful claim */
  onSuccess?: (txDigest: string, amount: bigint) => void;
  /** Custom class name */
  className?: string;
}

// Token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  NSN: 9,
  SUI: 9,
  NUSDC: 6,
  NBTC: 8,
};

function formatBalance(balance: bigint, decimals: number): string {
  const str = balance.toString().padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals) || '0';
  const fractional = str.slice(-decimals).replace(/0+$/, '');

  if (fractional) {
    return `${whole}.${fractional}`;
  }
  return whole;
}

export function LinkClaimPage({
  linkUrl,
  linkData,
  isLoadingLinkData = false,
  linkDataError = null,
  onSuccess,
  className = '',
}: LinkClaimPageProps) {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn, login: zkLogin } = useZkLogin();
  const { isUnlocked: isPasskeyUnlocked } = usePasskey();
  const { claim, parseUrl, isLoading: isClaiming, error: claimError, canClaim } = useClaimFromUrl();
  const linkStatus = useLinkStatus(linkData);
  const { hasFunds, isLoading: isLoadingBalance } = useLinkBalance(
    linkData?.ephemeralAddress ?? null,
    linkData?.config.coinType ?? 'NSN'
  );

  const [password, setPassword] = useState('');
  const [claimed, setClaimed] = useState(false);
  const [claimedAmount, setClaimedAmount] = useState<bigint | null>(null);
  const [claimedTxDigest, setClaimedTxDigest] = useState<string | null>(null);

  const isConnected = status === 'unlocked' || isZkLoggedIn || isPasskeyUnlocked;

  // Parse link to get basic info
  let parsedLink: { linkId: string; secret: string } | null = null;
  try {
    parsedLink = parseUrl(linkUrl);
  } catch {
    // Invalid URL format
  }

  // Check if password is required
  const requiresPassword = linkData?.config.conditions?.some((c) => c.type === 'password') ?? false;

  // Token info
  const coinType = linkData?.config.coinType ?? 'NSN';
  const decimals = TOKEN_DECIMALS[coinType] ?? 9;
  const amount = linkData ? BigInt(linkData.config.amount) : 0n;

  // Handle claim
  const handleClaim = useCallback(async () => {
    if (!linkData || !canClaim) return;

    try {
      const result = await claim(linkUrl, linkData, requiresPassword ? password : undefined);
      setClaimed(true);
      setClaimedAmount(result.amount);
      setClaimedTxDigest(result.txDigest);
      onSuccess?.(result.txDigest, result.amount);
    } catch {
      // Error handled by hook
    }
  }, [linkData, canClaim, claim, linkUrl, requiresPassword, password, onSuccess]);

  // Handle zkLogin
  const handleZkLogin: (provider: ZkLoginProvider) => void = useCallback(
    (provider) => {
      void zkLogin(provider).catch((err: unknown) => {
        console.error('zkLogin failed:', err);
      });
    },
    [zkLogin]
  );

  // Loading link data
  if (isLoadingLinkData) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 dark:text-zinc-400">Loading link...</p>
      </div>
    );
  }

  // Link data error
  if (linkDataError) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-lg xl:text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Link Not Found
        </h3>
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">{linkDataError}</p>
      </div>
    );
  }

  // Invalid link format
  if (!parsedLink || !linkData) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg xl:text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Invalid Link
        </h3>
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          This link format is not valid.
        </p>
      </div>
    );
  }

  // Link already claimed or expired
  if (linkStatus && !linkStatus.canClaim && !claimed) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg xl:text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {linkStatus.status === 'claimed' ? 'Already Claimed' : 'Link Expired'}
        </h3>
        <p className="text-sm xl:text-base text-gray-500 dark:text-zinc-400">
          {linkStatus.message}
        </p>
      </div>
    );
  }

  // Successfully claimed
  if (claimed && claimedTxDigest) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg xl:text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Claimed Successfully!
        </h3>
        <p className="text-2xl font-bold text-blue-500 mb-2">
          {claimedAmount ? formatBalance(claimedAmount, decimals) : formatBalance(amount, decimals)} {coinType}
        </p>
        {linkData.config.message && (
          <p className="text-sm xl:text-base text-gray-600 dark:text-zinc-400 mb-4">
            "{linkData.config.message}"
          </p>
        )}
      </div>
    );
  }

  // Main claim UI
  return (
    <div className={className}>
      {/* Gift icon and amount */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>

        <h2 className="text-xl xl:text-2xl font-bold text-gray-900 dark:text-white mb-1">
          You received a gift!
        </h2>

        <p className="text-3xl font-bold text-blue-500">
          {formatBalance(amount, decimals)} {coinType}
        </p>

        {linkData.config.message && (
          <p className="text-gray-600 dark:text-zinc-400 mt-2">
            "{linkData.config.message}"
          </p>
        )}

        {/* Balance check */}
        {isLoadingBalance ? (
          <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 mt-2">Checking funds...</p>
        ) : hasFunds === false ? (
          <p className="text-xs xl:text-sm text-red-500 mt-2">This link has no funds</p>
        ) : null}
      </div>

      {/* Not connected - show login options */}
      {!isConnected && (
        <div className="space-y-4">
          <p className="text-center text-sm xl:text-base text-gray-600 dark:text-zinc-400">
            Sign in to claim your tokens
          </p>

          <SocialLoginButtons
            providers={['google']}
            onLogin={handleZkLogin}
            showText={true}
            size="lg"
          />

          <p className="text-center text-xs xl:text-sm text-gray-400 dark:text-zinc-400">
            Claim in 10 seconds with your Google account
          </p>
        </div>
      )}

      {/* Connected - show claim button */}
      {isConnected && (
        <div className="space-y-4">
          {/* Password input if required */}
          {requiresPassword && (
            <div>
              <label className="block text-sm xl:text-base font-medium text-gray-700 dark:text-zinc-300 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter link password"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Error */}
          {claimError && (
            <p className="text-sm xl:text-base text-red-500 text-center">{claimError}</p>
          )}

          {/* Claim button */}
          <button
            onClick={handleClaim}
            disabled={isClaiming || hasFunds === false || (requiresPassword && !password)}
            className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-zinc-600 text-white disabled:text-gray-500 dark:disabled:text-zinc-400 rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
          >
            {isClaiming ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Claiming...
              </>
            ) : (
              <>
                Claim {formatBalance(amount, decimals)} {coinType}
              </>
            )}
          </button>

          {/* Expiration info */}
          {linkData.config.expiresAt && (
            <p className="text-xs xl:text-sm text-center text-gray-400 dark:text-zinc-400">
              Expires: {new Date(linkData.config.expiresAt).toLocaleString('en-US')}
            </p>
          )}
        </div>
      )}

      {/* Sender info */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-zinc-700">
        <p className="text-xs xl:text-sm text-gray-400 dark:text-zinc-400 text-center">
          From: {linkData.creator.slice(0, 8)}...{linkData.creator.slice(-6)}
        </p>
      </div>
    </div>
  );
}
