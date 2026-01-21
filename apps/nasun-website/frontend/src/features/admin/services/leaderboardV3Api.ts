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
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create post: ${response.status}`);
  }

  return response.json();
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
 * Calculate post score preview (client-side calculation)
 * This matches the backend calculation for UI preview
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
