/**
 * Shared profile types used across the Nasun ecosystem.
 *
 * The shape mirrors the response of nasun-website's GET /user-profile Lambda
 * (after `buildUnifiedProfile`). All consuming apps should use this type as
 * the canonical profile contract.
 */

export type ProfileSource = 'custom' | 'twitter' | 'google' | 'wallet';

export interface LinkedAccountSummary {
  username?: string;
  email?: string;
  profileImageUrl?: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  walletAddress?: string;
}

export interface EcosystemProfile {
  identityId?: string;
  walletAddress?: string;

  /** User-set display name. Source of truth for ecosystem-wide identity. */
  customDisplayName?: string;
  /** Storage key under PUBLIC_AVATARS_BASE_URL. URL is composed at read-time. */
  customAvatarKey?: string;
  customAvatarUpdatedAt?: string;
  customAvatarBanned?: boolean;

  /** Provider used for the most recent login (legacy field). */
  provider?: string;
  /** Username from the login provider (legacy fallback). */
  username?: string;
  email?: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;

  linkedAccounts?: {
    google?: LinkedAccountSummary;
    twitter?: LinkedAccountSummary;
    metamask?: LinkedAccountSummary;
    'nasun wallet'?: LinkedAccountSummary;
  };

  /**
   * Cross-chain wallet addresses registered via paste (read-only display).
   * These are NOT cryptographically verified — uju does not initiate on-chain
   * transactions on these networks, so address ownership is taken on trust.
   * Verified MetaMask remains under linkedAccounts.metamask (HMAC-signed).
   */
  linkedSuiAddress?: string;
  linkedSolanaAddress?: string;
  linkedEthereumAddress?: string;

  /** ISO-8601 timestamp the user first appeared in UserProfiles. */
  createdAt?: string;
  updatedAt?: string;
}
