/**
 * GET /v3/accounts/search - Search accounts by username
 *
 * Query Parameters:
 * - q: Search query (username prefix)
 * - limit: Maximum results (default 10, max 20)
 * - seasonId: Optional season ID for rank lookup
 *
 * Returns accounts matching the search query with optional rank info.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { Account, Platform, DYNAMO_KEYS, SeasonAccountScore } from '../types';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;

interface SearchResult {
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: Platform;
  displayName?: string;
  profileImageUrl?: string;
  userScore?: number;
  rank?: number;
}

interface SearchResponse {
  accounts: SearchResult[];
  total: number;
}

function createResponse(
  statusCode: number,
  body: SearchResponse | { error: string }
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Search accounts by username prefix
 */
async function searchAccounts(
  query: string,
  limit: number
): Promise<Account[]> {
  const normalizedQuery = query.toLowerCase().replace(/^@/, '');

  if (normalizedQuery.length < 2) {
    return [];
  }

  // Scan with filter for username prefix matching
  // Note: In production with large datasets, consider using OpenSearch or a GSI
  const result = await docClient.send(
    new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      FilterExpression: 'begins_with(username, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': normalizedQuery,
      },
      Limit: limit * 10, // Scan more to account for filtering
    })
  );

  const accounts = (result.Items || []) as Account[];

  // Filter and sort: exact matches first, then prefix matches
  return accounts
    .filter((a) => a.username.startsWith(normalizedQuery))
    .sort((a, b) => {
      // Exact match first
      if (a.username === normalizedQuery && b.username !== normalizedQuery) return -1;
      if (b.username === normalizedQuery && a.username !== normalizedQuery) return 1;
      // Then by post count (more active accounts first)
      return (b.postCount || 0) - (a.postCount || 0);
    })
    .slice(0, limit);
}

/**
 * Get season ranks for accounts
 */
async function getSeasonRanks(
  seasonId: string,
  accountIds: string[]
): Promise<Map<string, { userScore: number; rank: number }>> {
  const rankMap = new Map<string, { userScore: number; rank: number }>();

  // Get all season account scores and calculate ranks
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      FilterExpression: 'seasonId = :seasonId AND sk = :sk',
      ExpressionAttributeValues: {
        ':seasonId': seasonId,
        ':sk': 'SCORE',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return rankMap;
  }

  const scores = result.Items as SeasonAccountScore[];

  // Sort by userScore descending
  scores.sort((a, b) => (b.userScore || 0) - (a.userScore || 0));

  // Assign ranks and build map for requested accountIds
  const accountIdSet = new Set(accountIds);
  scores.forEach((score, index) => {
    if (accountIdSet.has(score.accountId)) {
      rankMap.set(score.accountId, {
        userScore: score.userScore || 0,
        rank: index + 1,
      });
    }
  });

  return rankMap;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { accounts: [], total: 0 });
  }

  try {
    const query = event.queryStringParameters?.q;
    const limitStr = event.queryStringParameters?.limit;
    const seasonId = event.queryStringParameters?.seasonId;

    if (!query) {
      return createResponse(400, { error: 'Query parameter "q" is required' });
    }

    // Parse limit (default 10, max 20)
    let limit = parseInt(limitStr || '10', 10);
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 20) limit = 20;

    // Search accounts
    const accounts = await searchAccounts(query, limit);

    if (accounts.length === 0) {
      return createResponse(200, { accounts: [], total: 0 });
    }

    // Get ranks if seasonId provided
    let rankMap: Map<string, { userScore: number; rank: number }> | undefined;
    if (seasonId) {
      const accountIds = accounts.map((a) => a.accountId);
      rankMap = await getSeasonRanks(seasonId, accountIds);
    }

    // Build response
    const results: SearchResult[] = accounts.map((account) => {
      const rankInfo = rankMap?.get(account.accountId);
      return {
        accountId: account.accountId,
        username: account.username,
        originalUsername: account.originalUsername,
        platform: account.platform,
        displayName: account.displayName,
        profileImageUrl: account.profileImageUrl,
        userScore: rankInfo?.userScore,
        rank: rankInfo?.rank,
      };
    });

    return createResponse(200, {
      accounts: results,
      total: results.length,
    });
  } catch (error) {
    console.error('Error searching accounts:', error);
    return createResponse(500, { error: 'Internal server error' });
  }
};
