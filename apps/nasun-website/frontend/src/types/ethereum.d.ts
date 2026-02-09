/**
 * Ethereum NFT Type Definitions
 *
 * This file contains type definitions for Ethereum NFT data from various APIs:
 * - Alchemy API (Primary)
 * - Etherscan API (Fallback)
 * - Unified EthereumNFT type for UI components
 *
 * @module types/ethereum
 * @since 2025-11-13
 */

// ============================================================================
// Alchemy API Types (Primary)
// ============================================================================

/**
 * Alchemy NFT Contract Information
 */
export interface AlchemyNFTContract {
  address: string;
  name?: string;
  symbol?: string;
  tokenType: 'ERC721' | 'ERC1155' | 'UNKNOWN';
  openSeaMetadata?: {
    floorPrice?: number;
    collectionName?: string;
    safelistRequestStatus?: string;
    imageUrl?: string;
    description?: string;
    externalUrl?: string;
  };
}

/**
 * Alchemy NFT Media Information
 */
export interface AlchemyNFTMedia {
  gateway: string;
  thumbnail?: string;
  raw?: string;
  format?: string;
  bytes?: number;
}

/**
 * Alchemy NFT Metadata
 */
export interface AlchemyNFTMetadata {
  name?: string;
  description?: string;
  image?: string;
  external_url?: string;
  attributes?: Array<{
    trait_type?: string;
    value?: string | number;
  }>;
}

/**
 * Alchemy NFT Response (from getNFTsForOwner API)
 */
export interface AlchemyNFT {
  contract: AlchemyNFTContract;
  tokenId: string;
  tokenType: 'ERC721' | 'ERC1155' | 'UNKNOWN';
  title?: string;
  description?: string;
  timeLastUpdated?: string;
  media?: AlchemyNFTMedia[];
  metadata?: AlchemyNFTMetadata;
  tokenUri?: {
    raw?: string;
    gateway?: string;
  };
  balance?: string; // For ERC1155
}

/**
 * Alchemy API Response Wrapper
 */
export interface AlchemyNFTsResponse {
  ownedNfts: AlchemyNFT[];
  totalCount: number;
  pageKey?: string;
  blockHash?: string;
}

// ============================================================================
// Etherscan API Types (Fallback)
// ============================================================================

/**
 * Etherscan NFT Response (from tokennfttx API)
 */
export interface EtherscanNFT {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenID: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
}

/**
 * Etherscan API Response Wrapper
 */
export interface EtherscanNFTsResponse {
  status: string;
  message: string;
  result: EtherscanNFT[];
}

// ============================================================================
// Unified Ethereum NFT Type (For UI Components)
// ============================================================================

/**
 * Unified Ethereum NFT Type
 *
 * This type is used by UI components to display NFT information.
 * It normalizes data from both Alchemy and Etherscan APIs.
 */
export interface EthereumNFT {
  /** Contract address (lowercase) */
  contractAddress: string;

  /** Token ID */
  tokenId: string;

  /** NFT name/title */
  name?: string;

  /** NFT description */
  description?: string;

  /** NFT image URL (high resolution) */
  imageUrl?: string;

  /** NFT thumbnail URL (for lists) */
  thumbnailUrl?: string;

  /** Collection/Contract name */
  collectionName?: string;

  /** Token type (ERC721, ERC1155) */
  tokenType?: 'ERC721' | 'ERC1155' | 'UNKNOWN';

  /** Token symbol */
  tokenSymbol?: string;

  /** Balance (for ERC1155) */
  balance?: string;

  /** OpenSea metadata */
  openSea?: {
    floorPrice?: number;
    collectionSlug?: string;
    imageUrl?: string;
  };

  /** External URL (project website) */
  externalUrl?: string;

  /** Attributes/Traits */
  attributes?: Array<{
    traitType?: string;
    value?: string | number;
  }>;

  /** Data source */
  source: 'alchemy' | 'etherscan';

  /** Blockchain network */
  chain?: 'ethereum' | 'polygon';

  /** Last updated timestamp */
  lastUpdated?: string;
}

// ============================================================================
// API Error Types
// ============================================================================

/**
 * Ethereum API Error
 */
export interface EthereumAPIError {
  code: string;
  message: string;
  source: 'alchemy' | 'etherscan';
  statusCode?: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * NFT Query Parameters
 */
export interface NFTQueryParams {
  /** Wallet address */
  walletAddress: string;

  /** Filter by contract addresses (optional) */
  contractAddresses?: string[];

  /** Pagination cursor (for Alchemy) */
  pageKey?: string;

  /** Page size */
  pageSize?: number;
}

/**
 * NFT Filter Function Type
 */
export type NFTFilterFunction = (nft: EthereumNFT) => boolean;
