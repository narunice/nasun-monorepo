/**
 * GET /v3/leaderboard - Get leaderboard rankings
 *
 * Public endpoint that returns the current leaderboard with real-time score calculation.
 * Supports period filtering: weekly, monthly, alltime
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  ComputedUserScore,
  GetLeaderboardParams,
  GetLeaderboardResponse,
  LeaderboardEntry,
} from '../types';
import { getAllAccounts, getAccountsWithPostsInRange } from '../services/dynamodb-client';
import { calculateUserScore, compareScores } from '../services/score-calculator';

/**
 * Get date range for period
 */
function getDateRange(period: string): { startDate: string; endDate: string } | null {
  const now = new Date();
  const endDate = now.toISOString().split('T')[0];

  switch (period) {
    case 'weekly': {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return {
        startDate: weekAgo.toISOString().split('T')[0],
        endDate,
      };
    }
    case 'monthly': {
      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return {
        startDate: monthAgo.toISOString().split('T')[0],
        endDate,
      };
    }
    case 'alltime':
    default:
      return null; // No filtering for alltime
  }
}

/**
 * Convert computed score to leaderboard entry
 */
function toLeaderboardEntry(
  score: ComputedUserScore,
  rank: number,
  includeBreakdown = false
): LeaderboardEntry {
  const entry: LeaderboardEntry = {
    rank,
    username: score.username,
    platform: score.platform,
    userScore: Math.round(score.userScore * 100) / 100, // 2 decimal places
    postCount: score.postCount,
    uniqueActiveDays: score.uniqueActiveDays,
    lastActivity: score.lastSeenAt,
    displayName: score.displayName,
    profileImageUrl: score.profileImageUrl,
    isRegistered: score.isRegistered,
  };

  if (includeBreakdown) {
    entry.breakdown = {
      rawScore: Math.round(score.rawScore * 100) / 100,
      consistencyBonus: Math.round(score.consistencyBonus * 100) / 100,
      freshnessMultiplier: Math.round(score.freshnessMultiplier * 100) / 100,
    };
  }

  return entry;
}

/**
 * Parsed and validated query parameters
 */
interface ParsedParams {
  period: 'weekly' | 'monthly' | 'alltime';
  limit: number;
  offset: number;
}

/**
 * Parse query parameters
 */
function parseParams(event: APIGatewayProxyEvent): ParsedParams {
  const queryParams = event.queryStringParameters || {};

  return {
    period: (queryParams.period as 'weekly' | 'monthly' | 'alltime') || 'alltime',
    limit: Math.min(parseInt(queryParams.limit || '100', 10), 500),
    offset: parseInt(queryParams.offset || '0', 10),
  };
}

/**
 * Create CORS response
 */
function createResponse(
  statusCode: number,
  body: GetLeaderboardResponse | { error: string }
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      // Cache for 5 minutes
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {
      entries: [],
      totalCount: 0,
      period: 'alltime',
      calculatedAt: new Date().toISOString(),
    });
  }

  try {
    const params = parseParams(event);
    const { period, limit, offset } = params;

    // Get accounts based on period
    let accounts;
    const dateRange = getDateRange(period);

    if (dateRange) {
      // Filter by date range for weekly/monthly
      accounts = await getAccountsWithPostsInRange(
        dateRange.startDate,
        dateRange.endDate
      );
    } else {
      // All accounts for alltime
      accounts = await getAllAccounts();
    }

    // Calculate scores at read-time (this ensures freshness is always current)
    const computedScores: ComputedUserScore[] = accounts
      .filter((account) => account.postCount > 0) // Only accounts with posts
      .map((account) => calculateUserScore(account));

    // Sort by score (with tie-breaking)
    computedScores.sort(compareScores);

    // Apply pagination
    const totalCount = computedScores.length;
    const paginatedScores = computedScores.slice(offset, offset + limit);

    // Convert to leaderboard entries with ranks
    const includeBreakdown =
      event.queryStringParameters?.breakdown === 'true';

    const entries: LeaderboardEntry[] = paginatedScores.map((score, index) =>
      toLeaderboardEntry(score, offset + index + 1, includeBreakdown)
    );

    const response: GetLeaderboardResponse = {
      entries,
      totalCount,
      period,
      calculatedAt: new Date().toISOString(),
    };

    return createResponse(200, response);
  } catch (error) {
    console.error('Error getting leaderboard:', error);

    return createResponse(500, {
      error: 'Internal server error',
    });
  }
};
