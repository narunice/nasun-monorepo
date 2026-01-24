/**
 * GET /v3/leaderboard/top-climbers
 *
 * Returns users with the biggest rank improvements over a time period.
 *
 * Query Parameters:
 * - range: 'today' | '7d' | '4w' (default: '7d')
 * - limit: number (default: 10, max: 50)
 * - seasonId: string (optional, defaults to active season)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DailySnapshot,
  TopClimbersResponse,
  TopClimberEntry,
  DYNAMO_KEYS,
} from '../types';
import { getActiveSeason, getSeasonById } from '../services/dynamodb-client';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function createResponse(statusCode: number, body: object): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

/**
 * Get date string N days ago
 */
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  // Use KST (UTC+9) for consistency with snapshot generation
  date.setTime(date.getTime() + 9 * 60 * 60 * 1000);
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date string in KST
 */
function getTodayDateString(): string {
  const date = new Date();
  date.setTime(date.getTime() + 9 * 60 * 60 * 1000);
  return date.toISOString().split('T')[0];
}

/**
 * Get snapshot for a specific date
 */
async function getSnapshot(seasonId: string, date: string): Promise<Map<string, DailySnapshot>> {
  const pk = `${seasonId}#${date}`;
  const snapshotMap = new Map<string, DailySnapshot>();

  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
    })
  );

  if (result.Items) {
    for (const item of result.Items) {
      const snapshot = item as DailySnapshot;
      snapshotMap.set(snapshot.accountId, snapshot);
    }
  }

  return snapshotMap;
}

/**
 * Calculate top climbers between two snapshots
 */
function calculateTopClimbers(
  currentSnapshot: Map<string, DailySnapshot>,
  previousSnapshot: Map<string, DailySnapshot>,
  limit: number
): TopClimberEntry[] {
  const climbers: TopClimberEntry[] = [];

  // Compare current ranks to previous ranks
  for (const [accountId, current] of currentSnapshot) {
    const previous = previousSnapshot.get(accountId);

    // Calculate rank change
    let rankChange: number;
    let direction: 'up' | 'down' | 'same' | 'new';

    if (!previous) {
      // New entry - show as rank improvement from outside top
      direction = 'new';
      rankChange = 0;
    } else {
      rankChange = previous.rank - current.rank;
      if (rankChange > 0) {
        direction = 'up';
      } else if (rankChange < 0) {
        direction = 'down';
      } else {
        direction = 'same';
      }
    }

    // Only include users who improved their rank (positive change)
    if (direction === 'up' || direction === 'new') {
      climbers.push({
        accountId,
        username: current.username,
        originalUsername: current.originalUsername,
        platform: current.platform,
        displayName: current.displayName,
        profileImageUrl: current.profileImageUrl,
        currentRank: current.rank,
        previousRank: previous?.rank || 0,
        rankChange: {
          direction,
          amount: Math.abs(rankChange),
        },
        currentScore: current.userScore,
      });
    }
  }

  // Sort by rank improvement (most improved first)
  // For 'new' entries, use current rank as secondary sort
  climbers.sort((a, b) => {
    // Prioritize actual climbers over new entries
    if (a.rankChange.direction === 'new' && b.rankChange.direction !== 'new') {
      return 1;
    }
    if (a.rankChange.direction !== 'new' && b.rankChange.direction === 'new') {
      return -1;
    }
    // Sort by amount of change
    if (b.rankChange.amount !== a.rankChange.amount) {
      return b.rankChange.amount - a.rankChange.amount;
    }
    // Secondary sort by current rank
    return a.currentRank - b.currentRank;
  });

  return climbers.slice(0, limit);
}

/**
 * Main handler
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get Top Climbers request:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {});
  }

  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const range = (queryParams.range || '7d') as 'today' | '7d' | '4w';
    const limit = Math.min(parseInt(queryParams.limit || '10', 10), 50);
    let seasonId = queryParams.seasonId;

    // Get season
    let season;
    if (seasonId) {
      season = await getSeasonById(seasonId);
      if (!season) {
        return createResponse(404, { error: `Season ${seasonId} not found` });
      }
    } else {
      season = await getActiveSeason();
      if (!season) {
        return createResponse(404, { error: 'No active season found' });
      }
      seasonId = season.seasonId;
    }

    // Calculate date range
    const todayDate = getTodayDateString();
    let previousDate: string;

    switch (range) {
      case 'today':
        previousDate = getDateNDaysAgo(1);
        break;
      case '7d':
        previousDate = getDateNDaysAgo(7);
        break;
      case '4w':
        previousDate = getDateNDaysAgo(28);
        break;
      default:
        previousDate = getDateNDaysAgo(7);
    }

    console.log(`Comparing snapshots: ${previousDate} -> ${todayDate}`);

    // Get snapshots
    const currentSnapshot = await getSnapshot(seasonId, todayDate);
    const previousSnapshot = await getSnapshot(seasonId, previousDate);

    // If today's snapshot doesn't exist yet, try yesterday
    if (currentSnapshot.size === 0) {
      const yesterdayDate = getDateNDaysAgo(1);
      console.log(`Today's snapshot not found, trying ${yesterdayDate}`);
      const yesterdaySnapshot = await getSnapshot(seasonId, yesterdayDate);
      if (yesterdaySnapshot.size > 0) {
        // Use yesterday as current
        for (const [key, value] of yesterdaySnapshot) {
          currentSnapshot.set(key, value);
        }
      }
    }

    if (currentSnapshot.size === 0) {
      return createResponse(200, {
        seasonId,
        range,
        climbers: [],
        calculatedAt: new Date().toISOString(),
        message: 'No snapshot data available yet',
      });
    }

    // Calculate top climbers (filter banned accounts)
    const { getBannedAccountIds } = await import('../services/dynamodb-client');
    const bannedIds = await getBannedAccountIds();
    const allClimbers = calculateTopClimbers(currentSnapshot, previousSnapshot, limit + 20);
    const climbers = allClimbers
      .filter((climber) => !bannedIds.has(climber.accountId))
      .slice(0, limit);

    const response: TopClimbersResponse = {
      seasonId,
      range,
      climbers,
      calculatedAt: new Date().toISOString(),
    };

    return createResponse(200, response);
  } catch (error) {
    console.error('Error getting top climbers:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
