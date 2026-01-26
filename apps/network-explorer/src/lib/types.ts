import type { SuiObjectResponse, SuiTransactionBlockResponse } from '@mysten/sui/client';

export interface AddressInfo {
  balance: {
    totalBalance: string;
    coinType: string;
    coinObjectCount: number;
  };
  allBalances: {
    coinType: string;
    coinObjectCount: number;
    totalBalance: string;
    lockedBalance: Record<string, string>;
  }[];
  ownedObjects: SuiObjectResponse[];
  hasNextPage: boolean;
  nextCursor?: string | null;
}

export interface NetworkStatus {
  chainId: string | null;
  latestCheckpoint: string | null;
  referenceGasPrice: string | null;
  isConnected: boolean;
}

export interface EpochInfo {
  epoch: string;
  epochStartTimestampMs: string;
  epochDurationMs: string;
  remainingMs: number;
  totalStake: string;
  progress: number;
  startTimestamp: number;
  endTimestamp: number;
}
