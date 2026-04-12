export type CreatorPostStatus =
  | 'PENDING'
  | 'SCORED'
  | 'GRANTED'
  | 'REJECTED'
  | 'CANCELED';

export interface CreatorPost {
  postId: string;
  createdAt: string;
  identityId: string;
  twitterId: string;
  twitterHandle: string;
  twitterProfileImageUrl?: string;
  postUrl: string;
  status: CreatorPostStatus;
  scoredPoints?: number;
  scoredAt?: string;
  scoredByAdminId?: string;
  rejectionReason?: string;
  grantedAt?: string;
  grantedByAdminId?: string;
  grantTxDigest?: string;
}

export interface CreatorPostSubmitResponse {
  postId: string;
  status: CreatorPostStatus;
  createdAt: string;
  dailyLimit: number;
  remainingToday: number;
}

export interface CreatorPostListResponse {
  items: CreatorPost[];
  nextCursor?: string;
  dailyLimit?: number;
}

export interface AdminCreatorPostListResponse {
  items: CreatorPost[];
  filter: CreatorPostStatus;
  nextCursor?: string;
}

export const STATUS_LABELS: Record<CreatorPostStatus, string> = {
  PENDING: 'Pending',
  SCORED: 'Scored',
  GRANTED: 'Granted',
  REJECTED: 'Rejected',
  CANCELED: 'Canceled',
};

export const STATUS_COLORS: Record<CreatorPostStatus, string> = {
  PENDING: 'bg-gray-500/20 text-gray-300',
  SCORED: 'bg-blue-500/20 text-blue-300',
  GRANTED: 'bg-green-500/20 text-green-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  CANCELED: 'bg-gray-500/10 text-gray-500 line-through',
};

export const POINTS_MIN = 1;
export const POINTS_MAX = 30;

export const ADMIN_STATUS_OPTIONS: CreatorPostStatus[] = [
  'PENDING',
  'SCORED',
  'GRANTED',
  'REJECTED',
];

// Safe image host allowlist (must match backend)
export const IMAGE_HOST_ALLOWLIST = ['pbs.twimg.com', 'abs.twimg.com'];

// Handle regex (must match backend)
export const HANDLE_RE = /^[a-z0-9_]{1,15}$/;
