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
} from '../types/leaderboard-v3';

import type { BannedAccountsResponse } from '../types';

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

/**
 * Create a new post entry (Admin only)
 */
export async function createPost(
  request: CreatePostRequest,
  adminPassword: string,
  adminUsername?: string
): Promise<CreatePostResponse> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/posts`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
      ...(adminUsername && { 'X-Admin-Username': adminUsername }),
    },
    body: JSON.stringify({
      postUrl: request.postUrl,
      accountRole: request.accountRole,
      contentSignals: request.contentSignals,
      postType: request.postType,
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
export async function getBannedAccounts(adminPassword: string): Promise<BannedAccountsResponse> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/blacklist`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
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
  adminPassword: string,
  accountId: string,
  reason?: string,
  adminUsername?: string
): Promise<void> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/blacklist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
      ...(adminUsername && { 'X-Admin-Username': adminUsername }),
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
  adminPassword: string,
  accountId: string
): Promise<void> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/blacklist/${encodeURIComponent(accountId)}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminPassword}` },
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
  platform: string = 'twitter'
): Promise<GetAccountResponse> {
  const searchParams = new URLSearchParams({ platform });
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
  adminPassword: string,
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
      'Authorization': `Bearer ${adminPassword}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to get cumulative leaderboard: ${response.status}`);
  }

  return response.json();
}

/**
 * Get dashboard statistics (Admin only)
 * Returns system stats, active season info, and recent activity
 */
export async function getDashboardStats(adminPassword: string): Promise<DashboardStats> {
  const url = `${LEADERBOARD_V3_API_URL}/v3/admin/stats`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminPassword}`,
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
  adminPassword: string,
  postId: string,
  updates: {
    platform?: string;
    username?: string;
    originalUsername?: string;
    postScore?: number;
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
      'Authorization': `Bearer ${adminPassword}`,
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
    zh: 1.67,
    ja: 2.5,
    ko: 5.0,
  };

  const SIGNAL_BONUSES: Record<string, number> = {
    standard: 0,
    insight: 1.0,
    creative: 1.0,
    high_reach: 1.0,
  };

  const BASE_SCORE = 1.0;
  const ROLE_MULTIPLIER_BASE = 1.0;
  const ROLE_MULTIPLIER_LOG_FACTOR = 0.2;
  const ROLE_MULTIPLIER_MAX = 2.0;

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
