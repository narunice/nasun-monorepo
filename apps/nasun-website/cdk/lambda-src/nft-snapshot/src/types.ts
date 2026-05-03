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
  // 'alchemy'           -> legacy wallet-by-wallet daily collector (eth-collector.ts)
  // 'alchemy-holder'    -> holder-centric daily collector (eth-collector-v2.ts)
  // 'alchemy-ondemand'  -> ecosystem-api activate fallback (Phase A negative cache)
  // 'etherscan'         -> reserved
  source: 'alchemy' | 'alchemy-holder' | 'alchemy-ondemand' | 'etherscan';
  // Set by ondemand fallback and v2 collector; absent on legacy v1 rows.
  lastUpdatedAt?: string;
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
  // Matches activation SK prefix (e.g. "genesis-pass"). Optional for legacy rows
  // written before the field existed; ownership-verifier falls back to a
  // slugified collectionName when missing.
  nftTypeId?: string;
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
  // v2 only: read-only mode. Fetches Alchemy + builds intersected records but
  // skips all DDB writes (BatchWrite, cleanup, META). Returns the SK set so
  // operators can diff against existing v1 snapshot rows for cutover validation.
  dryRun?: boolean;
}

export interface DevnetCollectorEvent {
  target: 'devnet';
  customDate?: string;
  force?: boolean;
}
