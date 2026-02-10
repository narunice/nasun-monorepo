// Admin types

export type UserRole = 'ADMIN' | 'USER';

export interface UserProfile {
  identityId: string;
  username?: string;
  email?: string;
  provider?: string;
  twitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
  walletAddress?: string;
  role?: UserRole;
  createdAt?: string;
  updatedAt?: string;
  linkedAccounts?: {
    google?: LinkedAccountInfo;
    twitter?: LinkedAccountInfo;
    metamask?: LinkedAccountInfo;
  };
}

export interface LinkedAccountInfo {
  identityId?: string;
  username?: string;
  email?: string;
  twitterHandle?: string;
  walletAddress?: string;
}

export interface AdminAuthState {
  isAdmin: boolean;
  isLoading: boolean;
  error: Error | null;
  profile: UserProfile | null;
  cognitoToken: string | null;
}

// Governance types (moved from GovernanceManagement.tsx)
export type ProposalType = 'Governance' | 'Poll';

export interface ProposalSummary {
  id: string;
  title: string;
  description: string;
  yesVotes: number;
  noVotes: number;
  yesPower: number;
  noPower: number;
  expiration: number;
  isExpired: boolean;
  isDelisted: boolean;
  proposalType: ProposalType;
  votersTableId: string;
  creator: string;
}

export interface VoterRecord {
  voter: string;
  votedYes: boolean;
  votingPower: number;
}

// Whitelist types (moved from adminApi.ts)
export interface WhitelistStats {
  genesis: { active: number; withdrawn: number; total: number };
  battalion: { active: number; withdrawn: number; total: number };
}

export interface ExportOptions {
  cognitoToken: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  batchId?: string;
  format?: 'default' | 'opensea';
}

export interface HiddenProposalsResponse {
  proposalIds: string[];
}

// NFT Collection types
export type NFTChain = 'ethereum' | 'polygon';

export interface NftCollection {
  collectionId: string;
  contractAddress: string;
  chain: NFTChain;
  collectionName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface NftCollectionsResponse {
  collections: NftCollection[];
}

export interface CreateNftCollectionRequest {
  contractAddress: string;
  chain: NFTChain;
  collectionName: string;
}

export interface UpdateNftCollectionRequest {
  collectionName?: string;
  enabled?: boolean;
  contractAddress?: string;
  chain?: NFTChain;
}

// Blacklist types
export interface BannedAccount {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: string;
  displayName?: string;
  profileImageUrl?: string;
  postCount: number;
  totalPostScore: number;
  banReason?: string;
  bannedAt?: string;
  bannedBy?: string;
}

export interface BannedAccountsResponse {
  success: boolean;
  accounts: BannedAccount[];
  total: number;
}
