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
  activeValidatorsCount: number;
  progress: number;
  startTimestamp: number;
  endTimestamp: number;
}
