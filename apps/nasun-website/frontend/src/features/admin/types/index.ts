// Admin types

export type UserRole = 'ADMIN' | 'USER';

export interface UserProfile {
  identityId: string;
  username?: string;
  email?: string;
  provider?: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
  walletAddress?: string;
  role?: UserRole;
  verified?: boolean;
  isTelegramMember?: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  linkedAccounts?: {
    google?: LinkedAccountInfo;
    twitter?: LinkedAccountInfo;
    metamask?: LinkedAccountInfo;
  };
  googleEmail?: string;
  linkedProviders?: string[];
  customDisplayName?: string;
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
  createdAt: number | null;
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
  genesisPass: {
    active: number; withdrawn: number; total: number; paidApplied: number;
    botCount: number; paidAppliedExBot: number; totalExBot: number;
  };
}

export interface ExportOptions {
  cognitoToken: string;
  status?: string;
  mintType?: string;
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
  // Slug used as the activation SK prefix (e.g. "genesis-pass"). Optional in
  // payloads to tolerate legacy rows.
  nftTypeId?: string;
  enabled: boolean;
  featured?: boolean;
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
  nftTypeId: string;
  featured?: boolean;
}

export interface UpdateNftCollectionRequest {
  collectionName?: string;
  nftTypeId?: string;
  enabled?: boolean;
  featured?: boolean;
  contractAddress?: string;
  chain?: NFTChain;
}

// User Management types
export interface ListUsersResponse {
  success: boolean;
  users: UserProfile[];
  nextToken?: string;
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  lastUpdated?: string;
  stats?: {
    totalRegistered: number;
    totalRegisteredExBot?: number;
    botCount?: number;
    telegramMembers: number;
    xConnected: number;
    emailConnected?: number;
    googleConnected?: number;
    flagged?: number;
  };
}

export interface UserDetailResponse {
  success: boolean;
  user: UserProfile;
}

export type SearchField = "auto" | "twitter" | "google" | "telegram" | "wallet" | "identityid" | "displayname";

export interface SearchUsersParams {
  q: string;
  field?: SearchField;
  resolvePrimary?: boolean;
}

export interface SearchUsersResponse {
  success: boolean;
  query: { q: string; field: string; resolvePrimary: boolean };
  matches: UserProfile[];
  truncated: boolean;
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
