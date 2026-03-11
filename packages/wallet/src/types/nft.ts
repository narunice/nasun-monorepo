/**
 * NFT Type Definitions
 * Based on Sui Object Display Standard
 */

/**
 * Standard Display fields from Sui Display Standard
 * @see https://docs.sui.io/standards/display
 */
export interface NFTDisplay {
  /** NFT name */
  name?: string;
  /** NFT description */
  description?: string;
  /** Full image URL (IPFS, HTTP, etc.) */
  image_url?: string;
  /** Smaller thumbnail URL for previews */
  thumbnail_url?: string;
  /** URL to view the NFT in an app */
  link?: string;
  /** Creator/project website */
  project_url?: string;
  /** Creator name */
  creator?: string;
}

/**
 * NFT information returned from queries
 */
export interface NFTInfo {
  /** Unique object ID */
  objectId: string;
  /** Object version */
  version: string;
  /** Object digest */
  digest: string;
  /** Full type string (e.g., "0x123::collection::NFT") */
  type: string;
  /** Parsed Display data */
  display: NFTDisplay;
  /** Raw object content for non-standard fields */
  content?: Record<string, unknown>;
  /** Whether the object can be transferred via TransferObjects (has `store` ability). Defaults to true when unknown. */
  hasPublicTransfer?: boolean;
}

/**
 * NFT query options
 */
export interface NFTQueryOptions {
  /** Maximum number of NFTs to fetch per page */
  limit?: number;
  /** Cursor for pagination */
  cursor?: string;
}

/**
 * NFT query result with pagination
 */
export interface NFTQueryResult {
  /** List of NFTs */
  data: NFTInfo[];
  /** Whether there are more results */
  hasNextPage: boolean;
  /** Cursor for next page */
  nextCursor?: string;
}

/**
 * NFT transfer request
 */
export interface NFTTransferRequest {
  /** Object ID of the NFT to transfer */
  objectId: string;
  /** Recipient address */
  to: string;
}

/**
 * NFT sorting options
 * - newest: Most recently updated (by version) first
 * - oldest: Oldest (by version) first
 * - name_asc: Alphabetical A-Z
 * - name_desc: Alphabetical Z-A
 */
export type NFTSortBy = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

/** Default sort order */
export const DEFAULT_NFT_SORT: NFTSortBy = 'newest';
