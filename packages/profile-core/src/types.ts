/**
 * Shared profile types used across the Nasun ecosystem.
 *
 * The shape mirrors the response of nasun-website's GET /user-profile Lambda
 * (after `buildUnifiedProfile`). All consuming apps should use this type as
 * the canonical profile contract.
 */

export type ProfileSource = 'custom' | 'twitter' | 'google' | 'wallet';

/**
 * A signature-verified secondary EVM address bound to the user's primary
 * MetaMask link. Each entry is proven via EIP-191 personal_sign with a
 * message that includes the address and optional appId (replay-resistant).
 *
 * See doc handoff `2026-05-16-per-app-verified-evm-binding.md` for the
 * binding model. `appBindings[appId]` on the metamask account points to
 * either the primary `walletAddress` or one of these additional addresses.
 */
export interface VerifiedAdditionalEvmAddress {
  /** Checksum-normalized 0x address. */
  walletAddress: string;
  /** Unix epoch ms when the signature was verified. */
  verifiedAt: number;
  /** Optional user-supplied label (e.g. "Trading wallet"). */
  label?: string;
}

export interface LinkedAccountSummary {
  username?: string;
  email?: string;
  profileImageUrl?: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  walletAddress?: string;

  /**
   * MetaMask-only: legacy pre-signature manual address entry. When true,
   * `walletAddress` is NOT signature-verified and must not be trusted for
   * any feature beyond display.
   */
  manualEntry?: boolean;
  /** MetaMask-only: unix epoch ms of primary signature verification. */
  verifiedAt?: number;
  /**
   * MetaMask-only: secondary EVM addresses, each independently
   * signature-verified. Capped at 5 entries server-side.
   */
  additionalAddresses?: VerifiedAdditionalEvmAddress[];
  /**
   * MetaMask-only: per-dApp address binding. Key is a short app id
   * (e.g. "uniswap", "hyperliquid"); value must be either the primary
   * `walletAddress` or one of `additionalAddresses[].walletAddress`.
   * Absent key falls back to the primary address.
   */
  appBindings?: Record<string, string>;
}

export interface EcosystemProfile {
  identityId?: string;
  walletAddress?: string;

  /**
   * Resolved display name from the server-side priority chain:
   * customDisplayName > Twitter username > Google email prefix.
   * Use this as the primary display name in UI components.
   */
  resolvedDisplayName?: string;
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
