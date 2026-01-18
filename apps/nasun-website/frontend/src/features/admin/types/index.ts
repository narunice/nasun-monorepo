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
}
