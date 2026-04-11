/**
 * Types for NFT Snapshot System
 *
 * Part A: ETH NFT ownership snapshots (daily cron, for soft staking)
 * Part B: Devnet NFT backup snapshots (on-demand, for reset recovery)
 */

// ========== DynamoDB Item Types ==========

/** ETH NFT ownership record per wallet per day */
export interface EthOwnershipRecord {
  pk: string; // ETH#YYYY-MM-DD or ETH#LATEST
  sk: string; // WALLET#0xabcdef...
  walletAddress: string;
  snapshotDate: string; // YYYY-MM-DD
  holdings: EthNftHolding[];
  totalNftCount: number;
  source: 'alchemy' | 'etherscan';
}

export interface EthNftHolding {
  contractAddress: string;
  chain: 'ethereum' | 'polygon';
  collectionName: string;
  tokenIds: string[];
  tokenCount: number;
}

/** Devnet NFT snapshot record */
export interface DevnetNftRecord {
  pk: string; // DEVNET#YYYY-MM-DD or DEVNET#LATEST
  sk: string; // NFT#0xobjectId...
  objectId: string;
  owner: string;
  nftType: string; // Logical name: "BetaAccessNFT"
  fullType: string; // Original type: "0xaf77e...::beta_access::BetaAccessNFT"
  fields: Record<string, unknown>;
  snapshotDate: string;
  version: string;
}

/** Snapshot metadata */
export interface SnapshotMeta {
  pk: string; // META
  sk: string; // ETH#YYYY-MM-DD or DEVNET#YYYY-MM-DD
  snapshotDate: string;
  totalCount: number;
  collectedAt: string;
  executionDurationMs: number;
  source: 'eth-collector' | 'devnet-collector';
}

// ========== NFT Type Registry ==========

export interface NFTTypeConfig {
  name: string;
  originalPackageId: string;
  currentPackageId: string;
  module: string;
  structName: string;
  mintEventType: string;
  restoreStrategy: 'admin_restore' | 'skip';
}

// ========== Alchemy API Types ==========

export interface AlchemyNft {
  contract: { address: string };
  id: { tokenId: string };
  tokenType?: string;
  title?: string;
  balance?: string;
}

export interface AlchemyNftsResponse {
  ownedNfts: AlchemyNft[];
  totalCount: number;
  pageKey?: string;
}

// ========== NFT Collection (from nasun-nft-collections table) ==========

export interface NftCollection {
  collectionId: string;
  contractAddress: string;
  chain: 'ethereum' | 'polygon';
  collectionName: string;
  enabled: boolean;
}

// ========== Sui RPC Types ==========

export interface SuiEventPage {
  data: SuiEvent[];
  nextCursor: { txDigest: string; eventSeq: string } | null;
  hasNextPage: boolean;
}

export interface SuiEvent {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: Record<string, unknown>;
}

export interface SuiObjectData {
  objectId: string;
  version: string;
  digest: string;
  type?: string;
  owner?: { AddressOwner?: string; ObjectOwner?: string; Shared?: unknown };
  content?: {
    dataType: string;
    type: string;
    fields: Record<string, unknown>;
  };
}

export interface SuiObjectResponse {
  data?: SuiObjectData;
  error?: { code: string; error: string };
}

// ========== Lambda Event Payloads ==========

export interface EthCollectorEvent {
  source?: 'schedule' | 'manual';
  customDate?: string; // YYYY-MM-DD for backfill
  force?: boolean;
}

export interface DevnetCollectorEvent {
  target: 'devnet';
  customDate?: string;
  force?: boolean;
}
