/**
 * Leaderboard V3 API Service
 *
 * API client for the Leaderboard V3 manual curation system.
 * Uses a separate API endpoint independent from V2.
 */

import type {
  CreatePostRequest,
  CreatePostResponse,
  GetLeaderboardParams,
  GetLeaderboardResponse,
  GetAccountResponse,
  DashboardStats,
  AdjustScoreRequest,
  AdjustScoreResponse,
} from '../types/leaderboard-v3';

import type { BannedAccountsResponse } from '../types';
import type { SeasonLeaderboardResponse } from '@/features/leaderboard-v3/types';

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

/**
 * Create a new post entry (Admin only)
 */
export async function createPost(
  request: CreatePostRequest,
  token: string,
): Promise<CreatePostResponse> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/posts`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      postUrl: request.postUrl,
      accountRole: request.accountRole,
      contentSignals: request.contentSignals,
      postType: request.postType,
      ...(request.seasonId ? { seasonId: request.seasonId } : {}),
      // Only include language/followerCount for new users
      ...(request.language && { language: request.language }),
      ...(request.followerCount !== undefined && { followerCount: request.followerCount }),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create post: ${response.status}`);
  }

  return response.json();
}

/**
 * Get list of banned accounts
 */
export async function getBannedAccounts(token: string): Promise<BannedAccountsResponse> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/blacklist`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch banned accounts: ${response.status}`);
  }
  return response.json();
}

/**
 * Ban an account
 */
export async function banAccountApi(
  token: string,
  accountId: string,
  reason?: string,
): Promise<void> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ accountId, reason }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Ban failed: ${response.status}`);
  }
}

/**
 * Unban an account
 */
export async function unbanAccountApi(
  token: string,
  accountId: string
): Promise<void> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/blacklist/${encodeURIComponent(accountId)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Unban failed: ${response.status}`);
  }
}

/**
 * Get leaderboard rankings (Public)
 */
export async function getLeaderboard(
  params: GetLeaderboardParams = {}
): Promise<GetLeaderboardResponse> {
  const searchParams = new URLSearchParams();

  if (params.period) searchParams.append('period', params.period);
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.breakdown) searchParams.append('breakdown', 'true');

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard?${searchParams}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get leaderboard: ${response.status}`);
  }

  return response.json();
}

/**
 * Get account by username (Public - for auto-prefill)
 */
export async function getAccount(
  username: string,
  platform: string = 'twitter',
  options?: { includePosts?: boolean }
): Promise<GetAccountResponse> {
  const searchParams = new URLSearchParams({ platform });
  if (options?.includePosts) {
    searchParams.set('includePosts', 'true');
  }
  const url = `${LEADERBOARD_V3_API_URL}/v3/accounts/${encodeURIComponent(username)}?${searchParams}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    // Return not found response for 404
    if (response.status === 404) {
      return { found: false };
    }
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get account: ${response.status}`);
  }

  return response.json();
}

/**
 * Get cumulative leaderboard (Admin only)
 * Returns all-time rankings across all seasons
 */
export async function getCumulativeLeaderboard(
  token: string,
  params: { limit?: number; offset?: number; breakdown?: boolean } = {}
): Promise<GetLeaderboardResponse> {
  const searchParams = new URLSearchParams();
  searchParams.append('cumulative', 'true');

  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.breakdown) searchParams.append('breakdown', 'true');

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard?${searchParams}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get cumulative leaderboard: ${response.status}`);
  }

  return response.json();
}

/**
 * Get season leaderboard with elevated limit (Admin only)
 * Returns full leaderboard data without the 500-entry public cap
 */
export async function getAdminSeasonLeaderboard(
  token: string,
  params: { seasonId?: string; snapshotDate?: string; limit?: number; offset?: number; breakdown?: boolean } = {}
): Promise<SeasonLeaderboardResponse> {
  const searchParams = new URLSearchParams();
  if (params.seasonId) searchParams.append('seasonId', params.seasonId);
  if (params.snapshotDate) searchParams.append('snapshotDate', params.snapshotDate);
  if (params.limit) searchParams.append('limit', params.limit.toString());
  if (params.offset) searchParams.append('offset', params.offset.toString());
  if (params.breakdown) searchParams.append('breakdown', 'true');

  const url = `${LEADERBOARD_V3_API_URL}/v3/leaderboard?${searchParams}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get admin season leaderboard: ${response.status}`);
  }

  return response.json();
}

/**
 * Get dashboard statistics (Admin only)
 * Returns system stats, active season info, and recent activity
 */
export async function getDashboardStats(token: string): Promise<DashboardStats> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/admin/stats`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get dashboard stats: ${response.status}`);
  }

  return response.json();
}

/**
 * Edit a post (Admin only)
 * Updates post fields and adjusts season/cumulative score aggregates
 */
export async function editPost(
  token: string,
  postId: string,
  updates: {
    platform?: string;
    username?: string;
    originalUsername?: string;
    postScore?: number;
    postType?: string;
    contentSignals?: string[];
    accountRole?: string;
    language?: string;
    followerCount?: number;
  }
): Promise<{ success: boolean; post: unknown; account?: unknown }> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/admin/posts/${encodeURIComponent(postId)}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to edit post: ${response.status}`);
  }

  return response.json();
}

/**
 * Adjust a user's score (Admin only)
 */
export async function adjustScore(
  request: AdjustScoreRequest,
  token: string,
): Promise<AdjustScoreResponse> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/admin/adjust-score`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to adjust score: ${response.status}`);
  }

  return response.json();
}

// --- Snapshot types ---

export interface SnapshotPreviewEntry {
  rank: number;
  username: string;
  displayName?: string;
  profileImageUrl?: string;
  userScore: number;
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  postCount: number;
  uniqueActiveDays: number;
  previousRank?: number;
  rankChange?: number;
}

export interface SnapshotPreviewResponse {
  success: true;
  dryRun: true;
  seasonId: string;
  calculatedAt: string;
  totalAccounts: number;
  preview: SnapshotPreviewEntry[];
}

export interface SnapshotTriggerResponse {
  success: true;
  dryRun: false;
  seasonId: string;
  snapshotDate: string;
  totalAccounts: number;
  snapshotCount: number;
}

/**
 * Preview snapshot calculation without writing to DynamoDB (Admin only).
 * Returns ranked accounts preview (up to MAX_SNAPSHOT_ENTRIES defined in backend).
 */
export async function previewSnapshot(
  token: string,
  seasonId?: string,
): Promise<SnapshotPreviewResponse> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/admin/snapshot`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ dryRun: true, ...(seasonId ? { seasonId } : {}) }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to preview snapshot: ${response.status}`);
  }

  return response.json();
}

/**
 * Trigger snapshot generation for today (Admin only).
 * Returns 409 if snapshot already exists for today.
 */
export async function triggerSnapshot(
  token: string,
  options: { seasonId?: string; customDate?: string } = {},
): Promise<SnapshotTriggerResponse> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/admin/snapshot`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      dryRun: false,
      ...(options.seasonId ? { seasonId: options.seasonId } : {}),
      ...(options.customDate ? { customDate: options.customDate } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    // Preserve snapshotDate in the error message for 409
    if (response.status === 409 && error.snapshotDate) {
      throw new Error(`Snapshot already exists for ${error.snapshotDate}`);
    }
    throw new Error(error.error || `Failed to trigger snapshot: ${response.status}`);
  }

  return response.json();
}

// ============================================
// Curated Featured Feed API
// ============================================

export interface CuratedFeedEntry {
  postId: string;
  badge: string;
  order: number;
}

export interface EnrichedFeedItem {
  type: 'post';
  postId: string;
  author: {
    accountId: string;
    username: string;
    originalUsername?: string;
    displayName?: string;
    profileImageUrl?: string;
    badges: string[];
  };
  content: {
    platform: string;
    postUrl: string;
    postType: string;
    signals: string[];
    createdAt: string;
  };
}

export interface CuratedFeedResponse {
  success: boolean;
  items: CuratedFeedEntry[];
  enrichedItems: EnrichedFeedItem[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Get the current curated featured feed (admin)
 */
export async function getCuratedFeed(token: string): Promise<CuratedFeedResponse> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/featured-feed`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch curated feed: ${response.status}`);
  }
  return response.json();
}

/**
 * Replace the curated featured feed (admin)
 */
export async function setCuratedFeed(
  token: string,
  items: CuratedFeedEntry[],
): Promise<void> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/featured-feed`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to save curated feed: ${response.status}`);
  }
}

/**
 * Calculate post score preview (client-side calculation) - Legacy discrete version
 * Kept for backwards compatibility
 */
export function calculatePostScorePreview(
  accountRole: string,
  contentSignals: string[]
): { baseScore: number; roleMultiplier: number; signalBonus: number; totalScore: number } {
  const ROLE_MULTIPLIERS: Record<string, number> = {
    kol: 2.0,
    proactive_ct: 1.5,
    default: 1.0,
  };

  const SIGNAL_BONUSES: Record<string, number> = {
    standard: 0,
    insight: 1.0,
    creative: 1.0,
    high_reach: 1.0,
  };

  const BASE_SCORE = 1.0;
  const roleMultiplier = ROLE_MULTIPLIERS[accountRole] || 1.0;
  const signalBonus = contentSignals.reduce(
    (sum, signal) => sum + (SIGNAL_BONUSES[signal] || 0),
    0
  );
  const totalScore = BASE_SCORE * roleMultiplier + signalBonus;

  return {
    baseScore: BASE_SCORE,
    roleMultiplier,
    signalBonus,
    totalScore,
  };
}

/**
 * Calculate post score preview with continuous role multiplier
 * Uses follower count and language for precise multiplier calculation
 */
export function calculatePostScorePreviewWithFollowers(
  followerCount: number,
  language: string,
  contentSignals: string[]
): { baseScore: number; roleMultiplier: number; signalBonus: number; totalScore: number } {
  const LANGUAGE_SCALE: Record<string, number> = {
    en: 1.0,
    zh: 1.0,
    ja: 1.0,
    ko: 1.0,
  };

  const SIGNAL_BONUSES: Record<string, number> = {
    standard: 0,
    insight: 1.0,
    creative: 1.0,
    high_reach: 1.0,
  };

  const BASE_SCORE = 1.0;
  const ROLE_MULTIPLIER_BASE = 0.3;
  const ROLE_MULTIPLIER_LOG_FACTOR = 0.74;
  const ROLE_MULTIPLIER_MAX = 4.0;

  // Calculate continuous role multiplier
  let roleMultiplier = ROLE_MULTIPLIER_BASE;
  if (followerCount > 0) {
    const scale = LANGUAGE_SCALE[language] || LANGUAGE_SCALE.en;
    const normalizedFollowers = followerCount * scale;
    roleMultiplier = Math.min(
      ROLE_MULTIPLIER_BASE + Math.log10(normalizedFollowers + 1) * ROLE_MULTIPLIER_LOG_FACTOR,
      ROLE_MULTIPLIER_MAX
    );
  }

  const signalBonus = contentSignals.reduce(
    (sum, signal) => sum + (SIGNAL_BONUSES[signal] || 0),
    0
  );
  const totalScore = BASE_SCORE * roleMultiplier + signalBonus;

  return {
    baseScore: BASE_SCORE,
    roleMultiplier: Math.round(roleMultiplier * 1000) / 1000, // Round to 3 decimals
    signalBonus,
    totalScore: Math.round(totalScore * 1000) / 1000,
  };
}
