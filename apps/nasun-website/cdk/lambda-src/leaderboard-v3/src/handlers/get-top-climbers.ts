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
import { getActiveSeason, getSeasonById, getBannedAccountIds } from '../services/dynamodb-client';
import { createResponse, getRequestOrigin } from '../utils/response';
import { getTodayDateString, getDateNDaysAgo } from '../utils/date';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;

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
    if ((direction === 'up' || direction === 'new') && current.rank <= 100) {
      const previousScore = previous?.userScore || 0;
      const scoreIncrease = current.userScore - previousScore;
      const percentageIncrease = previousScore > 0
        ? (scoreIncrease / previousScore) * 100
        : 0;

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
        previousScore,
        scoreIncrease,
        percentageIncrease,
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
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  console.log('Get Top Climbers request:', JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, {});
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
        return respond(404, { error: `Season ${seasonId} not found` });
      }
    } else {
      season = await getActiveSeason();
      if (!season) {
        return respond(404, { error: 'No active season found' });
      }
      seasonId = season.seasonId;
    }

    // Determine current snapshot date based on season status
    const isEndedSeason = season.status === 'ended' || season.status === 'archived';
    let currentDate: string;

    if (isEndedSeason) {
      // Ended seasons: use the final snapshot from endDate
      currentDate = season.endDate;
    } else {
      currentDate = getTodayDateString();
    }

    // Calculate comparison date range
    let previousDate: string;
    if (isEndedSeason) {
      // For ended seasons, calculate range relative to endDate
      const endDateObj = new Date(season.endDate);
      switch (range) {
        case 'today':
          endDateObj.setDate(endDateObj.getDate() - 1);
          break;
        case '7d':
          endDateObj.setDate(endDateObj.getDate() - 7);
          break;
        case '4w':
          endDateObj.setDate(endDateObj.getDate() - 28);
          break;
        default:
          endDateObj.setDate(endDateObj.getDate() - 7);
      }
      previousDate = endDateObj.toISOString().split('T')[0];
    } else {
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
    }

    // Get current snapshot first; previousSnapshot fetch is deferred until after fallback
    const currentSnapshot = await getSnapshot(seasonId, currentDate);

    // If current snapshot doesn't exist, try fallback (up to 7 days back).
    // On fallback success, also recalculate previousDate relative to the fallback date
    // to avoid comparing a snapshot against itself (same-date comparison bug).
    if (currentSnapshot.size === 0) {
      const MAX_FALLBACK_DAYS = 7;
      for (let daysBack = 1; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
        let fallbackDate: string;
        if (isEndedSeason) {
          const d = new Date(season.endDate);
          d.setDate(d.getDate() - daysBack);
          fallbackDate = d.toISOString().split('T')[0];
        } else {
          fallbackDate = getDateNDaysAgo(daysBack);
        }
        console.log(`Current snapshot not found, trying ${fallbackDate}`);
        const fallbackSnapshot = await getSnapshot(seasonId, fallbackDate);
        if (fallbackSnapshot.size > 0) {
          for (const [key, value] of fallbackSnapshot) {
            currentSnapshot.set(key, value);
          }
          // Recalculate previousDate relative to fallback date
          const d = new Date(fallbackDate);
          switch (range) {
            case 'today': d.setDate(d.getDate() - 1); break;
            case '7d':    d.setDate(d.getDate() - 7); break;
            case '4w':    d.setDate(d.getDate() - 28); break;
            default:      d.setDate(d.getDate() - 7);
          }
          previousDate = d.toISOString().split('T')[0];
          break;
        }
      }
    }

    console.log(`Comparing snapshots: ${previousDate} -> ${currentDate}`);

    if (currentSnapshot.size === 0) {
      return respond(200, {
        seasonId,
        range,
        climbers: [],
        calculatedAt: new Date().toISOString(),
        message: 'No snapshot data available yet',
      });
    }

    // Fetch previousSnapshot after fallback resolution so previousDate is finalized
    const previousSnapshot = await getSnapshot(seasonId, previousDate);

    // Calculate top climbers (filter banned accounts)
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

    return respond(200, response);
  } catch (error) {
    console.error('Error getting top climbers:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
