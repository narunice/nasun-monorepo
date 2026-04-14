export interface BugReportData {
  title: string;
  category: string;
  description: string;
  reproSteps?: string;
  displayName?: string;
  screenshotKeys?: string[];
  pageUrl?: string;
  walletAddress?: string;
}

export interface BugReportResponse {
  reportId: string;
  message: string;
}

export interface BugReport {
  reportId: string;
  timestamp: string;
  identityId: string;
  title: string;
  category: string;
  description: string;
  reproSteps?: string;
  status: BugReportStatus;
  screenshotKeys?: string[];
  screenshotUrls?: string[];
  walletAddress?: string;
  pageUrl?: string;
  adminNote?: string;
  bonusPoints?: number;
  rewardStatus?: string;
  twitterHandle?: string;
  profileImageUrl?: string;
  displayName?: string;
  updatedAt?: string;
  userReply?: string;
}

export type BugReportStatus = 'new' | 'investigating' | 'in-progress' | 'fixed' | 'wont-fix' | 'duplicate';

export const BUG_CATEGORIES = ['UI Bug', 'Wallet Issue', 'Performance', 'Security', 'Feature Request', 'Feedback', 'Other'] as const;
export type BugCategory = typeof BUG_CATEGORIES[number];

export const STATUS_LABELS: Record<BugReportStatus, string> = {
  'new': 'New',
  'investigating': 'Investigating',
  'in-progress': 'In Progress',
  'fixed': 'Fixed',
  'wont-fix': "Won't Fix",
  'duplicate': 'Duplicate',
};

export const STATUS_COLORS: Record<BugReportStatus, string> = {
  'new': 'bg-gray-500/20 text-gray-300',
  'investigating': 'bg-yellow-500/20 text-yellow-300',
  'in-progress': 'bg-blue-500/20 text-blue-300',
  'fixed': 'bg-green-500/20 text-green-300',
  'wont-fix': 'bg-red-500/20 text-red-300',
  'duplicate': 'bg-gray-500/20 text-gray-400',
};

export interface PresignedPostData {
  url: string;
  fields: Record<string, string>;
  key: string;
}
