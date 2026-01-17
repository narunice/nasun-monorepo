/**
 * Nasun Link Types
 *
 * Type definitions for claimable links functionality.
 */

// Link types

/** Link claim type */
export type LinkType = 'single' | 'multi' | 'first-n';

/** Link status */
export type LinkStatus = 'active' | 'claimed' | 'expired' | 'cancelled';

/** Coin type for link */
export type LinkCoinType = 'NSN' | '0x2::sui::SUI' | string;

/** Age threshold for ZK-ID */
export type ZKIDAgeThreshold = 18 | 21 | 25;

/** KYC level for ZK-ID */
export type ZKIDKYCLevel = 'basic' | 'advanced' | 'full';

/** Claim condition types */
export type ClaimCondition =
  | { type: 'none' }
  | { type: 'password'; hash: string }
  | { type: 'twitter'; handle: string }
  | { type: 'email'; domain: string }
  // ZK-ID conditions (P2-4)
  | { type: 'zkid-age'; threshold: ZKIDAgeThreshold }
  | { type: 'zkid-kyc'; level: ZKIDKYCLevel }
  | { type: 'zkid-unique'; contextId: string };

/** Link configuration */
export interface LinkConfig {
  /** Link type */
  type: LinkType;
  /** Token type to send */
  coinType: LinkCoinType;
  /** Amount per claim (in base units) */
  amount: bigint;
  /** Max number of claims (for multi/first-n) */
  maxClaims?: number;
  /** Expiration timestamp (ms) */
  expiresAt?: number;
  /** Optional message for recipient */
  message?: string;
  /** Claim conditions (for gated links) */
  conditions?: ClaimCondition[];
}

/** Serializable link configuration (for storage) */
export interface SerializableLinkConfig {
  type: LinkType;
  coinType: LinkCoinType;
  amount: string; // bigint serialized as string
  maxClaims?: number;
  expiresAt?: number;
  message?: string;
  conditions?: ClaimCondition[];
}

/** Link data stored on-chain or backend */
export interface LinkData {
  /** Unique link ID */
  id: string;
  /** Creator address */
  creator: string;
  /** Ephemeral address holding funds */
  ephemeralAddress: string;
  /** Encrypted payload (contains ephemeral private key) */
  encryptedPayload: string;
  /** Link configuration */
  config: SerializableLinkConfig;
  /** Current status */
  status: LinkStatus;
  /** Number of claims made */
  claimCount: number;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Funding transaction digest */
  fundingTxDigest?: string;
}

/** Claim result */
export interface ClaimResult {
  /** Transaction digest */
  txDigest: string;
  /** Amount claimed */
  amount: bigint;
  /** Recipient address */
  recipient: string;
  /** Link ID */
  linkId: string;
}

/** Link URL components */
export interface LinkURL {
  /** Base URL (e.g., https://nasun.io/claim) */
  baseUrl: string;
  /** Public link ID */
  linkId: string;
  /** Secret (URL hash fragment) */
  secret: string;
  /** Full URL including secret */
  fullUrl: string;
}

/** Create link request */
export interface CreateLinkRequest {
  /** Link configuration */
  config: LinkConfig;
  /** Custom base URL (optional) */
  baseUrl?: string;
}

/** Create link response */
export interface CreateLinkResponse {
  /** Generated URL */
  url: LinkURL;
  /** Link data for storage */
  data: LinkData;
}

/** Claim validation result */
export interface ClaimValidation {
  /** Whether claim is allowed */
  canClaim: boolean;
  /** Reason if claim is denied */
  reason?: string;
  /** Remaining claims (for multi/first-n) */
  remainingClaims?: number;
  /** Expiration time if set */
  expiresAt?: number;
}

/** Link storage interface */
export interface LinkStorage {
  /** Save link data */
  save(data: LinkData): Promise<void>;
  /** Get link by ID */
  get(id: string): Promise<LinkData | null>;
  /** Update link status */
  updateStatus(id: string, status: LinkStatus): Promise<void>;
  /** Increment claim count */
  incrementClaimCount(id: string): Promise<void>;
  /** Get links by creator */
  getByCreator(creator: string): Promise<LinkData[]>;
}

/** Convert LinkConfig to SerializableLinkConfig */
export function serializeLinkConfig(config: LinkConfig): SerializableLinkConfig {
  return {
    ...config,
    amount: config.amount.toString(),
  };
}

/** Convert SerializableLinkConfig to LinkConfig */
export function deserializeLinkConfig(config: SerializableLinkConfig): LinkConfig {
  return {
    ...config,
    amount: BigInt(config.amount),
  };
}
