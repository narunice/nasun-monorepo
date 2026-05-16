import { create } from 'zustand';
import logger from '../lib/logger';

/**
 * A signature-verified secondary EVM address bound to the user's primary
 * MetaMask link. Each entry is proven via EIP-191 personal_sign with a
 * message that embeds the address and optional appId (replay-resistant).
 * Mirrors `VerifiedAdditionalEvmAddress` in `@nasun/profile-core`.
 */
export interface VerifiedAdditionalEvmAddress {
  walletAddress: string;
  verifiedAt: number;
  label?: string;
}

/**
 * A signature-verified Solana address (primary or one of additionalAddresses).
 * Mirrors `VerifiedAdditionalEvmAddress` but lives under
 * `linkedAccounts.solana`. Base58 strings are case-sensitive — store and
 * compare exactly.
 */
export interface VerifiedAdditionalSolanaAddress {
  walletAddress: string;
  verifiedAt: number;
  label?: string;
}

/**
 * Solana counterpart to LinkedAccount.metamask. Created on the user's
 * first Ed25519 signMessage verify. Legacy paste-linked addresses live at
 * the root `linkedSolanaAddress` field (not here) and are treated as
 * unverified by selectors like `useValidSolanaAddress`.
 */
export interface LinkedSolanaAccount {
  walletAddress: string;
  verifiedAt: number;
  /** True for legacy paste-only entries. The verified flow writes false (or omits). */
  manualEntry?: boolean;
  additionalAddresses?: VerifiedAdditionalSolanaAddress[];
  appBindings?: Record<string, string>;
  linkedAt?: string;
}

// Linked account information
export interface LinkedAccount {
  identityId?: string;
  username: string;
  linkedAt: string;
  profileImageUrl?: string;
  // Twitter-specific
  twitterHandle?: string;
  originalTwitterHandle?: string; // Original casing for display
  twitterId?: string;
  // Google-specific
  email?: string;
  // MetaMask-specific
  walletAddress?: string;
  // Manual EVM address entry (no signature verification)
  manualEntry?: boolean;
  // MetaMask-only: unix epoch ms of primary signature verification.
  verifiedAt?: number;
  // MetaMask-only: secondary EVM addresses, each independently
  // signature-verified. Capped at 5 entries server-side.
  additionalAddresses?: VerifiedAdditionalEvmAddress[];
  // MetaMask-only: per-dApp address binding. Key is a short app id
  // (e.g. "uniswap", "hyperliquid"); value is one of the verified
  // wallet addresses (primary or an additionalAddresses entry).
  appBindings?: Record<string, string>;
}

// Simplified UserData interface for Identity Pool logins
export interface UserData {
  identityId: string;
  provider: string; // 'Google' | 'Twitter' | wallet connector name (e.g., 'MetaMask', 'Coinbase Wallet')
  username: string; // name from the social provider
  email?: string; // email from Google
  // Twitter-specific fields
  twitterHandle?: string;
  originalTwitterHandle?: string; // Original casing for display
  twitterId?: string;
  profileImageUrl?: string;
  // MetaMask-specific fields
  walletAddress?: string;
  // Cognito OIDC token for authenticated API calls
  cognitoToken?: string;
  // Custom display name (set by user via My Account or uju Profile).
  // Ecosystem source-of-truth identity name; takes priority over X/Google.
  customDisplayName?: string;
  // Storage key (S3 object key) of user-uploaded avatar. Resolved to URL via
  // PUBLIC_AVATARS_BASE_URL env var + `@nasun/profile-core` resolveAvatarUrl.
  customAvatarKey?: string;
  customAvatarUpdatedAt?: string;
  /** When true, custom avatar uploads are blocked by admin moderation. */
  customAvatarBanned?: boolean;
  // Admin role (set via admin action, returned from DB)
  role?: string;
  // Linked accounts
  linkedAccounts?: {
    google?: LinkedAccount;
    twitter?: LinkedAccount;
    metamask?: LinkedAccount;
    solana?: LinkedSolanaAccount;
    'nasun wallet'?: LinkedAccount;
  };
}

interface UserState {
  user: UserData | null;
  isLoading: boolean;
  error: string | null;
  setUser: (userData: UserData | null) => void;
  clearUser: () => void;
  setIsLoading: (loading: boolean) => void;
  updateUserProfile: (updatedData: Partial<UserData>) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  setUser: (userData) => {
    logger.log('Setting user:', userData);
    set({ user: userData, isLoading: false, error: null });
  },

  clearUser: () => {
    logger.log('Clearing user');
    set({ user: null, isLoading: false, error: null });
  },

  setIsLoading: (loading) => {
    set({ isLoading: loading });
  },

  updateUserProfile: (updatedData) => {
    set((state) => {
      if (state.user) {
        // If updatedData is a complete user object (has identityId), replace entirely
        const isCompleteProfile = 'identityId' in updatedData;
        const updatedUser = isCompleteProfile
          ? updatedData as UserData  // Complete replacement
          : { ...state.user, ...updatedData };  // Partial update

        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedUser));
        logger.log('Updating user profile:', updatedUser);
        return { user: updatedUser };
      }
      return state;
    });
  },
}));