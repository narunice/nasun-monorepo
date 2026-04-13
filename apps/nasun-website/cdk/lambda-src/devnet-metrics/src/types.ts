/**
 * Types for Devnet Daily Metrics Collector
 */

// RPC response types

export interface TxEffectsOwner {
  AddressOwner?: string;
  ObjectOwner?: string;
  Shared?: unknown;
}

export interface TxObjectRef {
  owner: TxEffectsOwner;
}

export interface TxBlockResponse {
  digest: string;
  timestampMs: string;
  effects?: {
    created?: TxObjectRef[];
    mutated?: TxObjectRef[];
  };
}

export interface TxQueryResult {
  data: TxBlockResponse[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface CheckpointResponse {
  sequenceNumber: string;
  timestampMs: string;
  networkTotalTransactions: string;
}

// DynamoDB item types

export interface MetricsRecord {
  pk: string; // METRICS#YYYY-MM-DD
  sk: string; // DAILY
  dau: number;
  newAddresses: number;
  cumulativeAddresses: number;
  transactionCount?: number; // Daily TX count (snapshot diff, null on first run)
  collectedAt: string;
  executionDurationMs: number;
}

export interface AddressRecord {
  pk: string; // ADDRESS#0x...
  sk: string; // META
  firstSeenDate: string; // Faucet drip date (legacy; kept for backfill compatibility)
  firstActiveDate?: string; // First date this address appeared in DAU (authoritative for "new")
  discoveredAt: string;
}

export interface CollectorState {
  pk: string; // STATE
  sk: string; // COLLECTOR
  lastCollectedDate: string;
  totalKnownAddresses: number;
  lastFaucetCursor: string | null;
  lastNetworkTotalTx?: number; // Cumulative TX count at last collection
}

// Lambda event payload (EventBridge or manual invoke)

export interface CollectMetricsEvent {
  customDate?: string; // YYYY-MM-DD for backfill
  force?: boolean; // Override idempotency
}
