export interface LeaderboardEntry {
  identityId: string;
  totalPoints: string;
  activityCount: number;
  activeCategories: number;
  rank: number;
}

export interface UserPoints {
  walletAddress: string;
  identityId: string | null;
  totalPoints: string;
  activityCount: number;
  activeCategories: number;
  firstActivity: string | null;
  lastActivity: string | null;
  categories: { category: string; points: string; count: number }[];
}

export interface ScannerHealth {
  enabled: boolean;
  isScanning: boolean;
  lastTxSequence: number;
  processedAt: string | null;
  txCount: number;
  registeredWallets: number;
  genesisPassHolders: number;
}
