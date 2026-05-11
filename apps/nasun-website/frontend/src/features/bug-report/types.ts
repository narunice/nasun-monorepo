export interface BugReportData {
  title: string;
  app: string;
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
  app?: string;
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
  source?: string;
  submittedVia?: string;
  rewardType?: 'feedback' | 'bug-report';
}

export type BugReportStatus =
  | 'new'
  | 'investigating'
  | 'in-progress'
  | 'fixed'        // bug-oriented completion
  | 'wont-fix'     // bug-oriented rejection
  | 'accepted'     // feedback-oriented completion (triggers reward)
  | 'declined'     // feedback-oriented rejection
  | 'duplicate';

export const BUG_CATEGORIES = ['UI Bug', 'Wallet Issue', 'Performance', 'Security', 'Feature Request', 'Feedback', 'Other'] as const;
export type BugCategory = typeof BUG_CATEGORIES[number];

export const BUG_APPS = ['nasun', 'pado', 'gostop', 'network-explorer', 'general'] as const;
export type BugApp = typeof BUG_APPS[number];

export const STATUS_LABELS: Record<BugReportStatus, string> = {
  'new': 'New',
  'investigating': 'Investigating',
  'in-progress': 'In Progress',
  'fixed': 'Fixed',
  'wont-fix': "Won't Fix",
  'accepted': 'Accepted',
  'declined': 'Declined',
  'duplicate': 'Duplicate',
};

export const STATUS_COLORS: Record<BugReportStatus, string> = {
  'new': 'bg-gray-500/20 text-gray-300',
  'investigating': 'bg-yellow-500/20 text-yellow-300',
  'in-progress': 'bg-blue-500/20 text-blue-300',
  'fixed': 'bg-green-500/20 text-green-300',
  'wont-fix': 'bg-red-500/20 text-red-300',
  'accepted': 'bg-green-500/20 text-green-300',
  'declined': 'bg-red-500/20 text-red-300',
  'duplicate': 'bg-gray-500/20 text-gray-400',
};

// Categories treated as "feedback-oriented" — their admin UI shows
// accepted/declined instead of fixed/wont-fix.
export const FEEDBACK_CATEGORIES = ['Feedback', 'Feature Request'] as const;

export function isFeedbackCategory(category: string | undefined): boolean {
  return !!category && (FEEDBACK_CATEGORIES as readonly string[]).includes(category);
}

/** Admin-selectable statuses per category context. */
export function statusOptionsFor(category: string | undefined): BugReportStatus[] {
  const shared: BugReportStatus[] = ['new', 'investigating', 'in-progress', 'duplicate'];
  if (isFeedbackCategory(category)) {
    return [...shared, 'accepted', 'declined'];
  }
  return [...shared, 'fixed', 'wont-fix'];
}

export interface PresignedPostData {
  url: string;
  fields: Record<string, string>;
  key: string;
}
