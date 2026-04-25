export interface UserPoints {
  walletAddress: string;
  identityId: string | null;
  totalPoints: string;
  activityCount: number;
  activeCategories: number;
  firstActivity: string | null;
  lastActivity: string | null;
  categories: { category: string; points: string; count: number }[];
  todayCategories?: string[];
  hasActiveProposals?: boolean;
}
