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
} from '@aws-sdk/lib-dynamodb';
import { Account, Platform, DYNAMO_KEYS } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';
import { getBannedAccountIds, getSeasonById } from '../services/dynamodb-client';
import { getLatestSnapshot, computeDisplayRanks } from '../utils/snapshot-utils';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;

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

  // Paginated scan — DynamoDB Limit controls items *evaluated*, not items *returned*.
  // Without pagination, matches beyond the first batch are missed.
  const allMatches: Account[] = [];
  let lastKey: Record<string, unknown> | undefined;
  const MAX_SCANS = 10;
  let scanCount = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        FilterExpression: 'contains(username, :query)',
        ExpressionAttributeValues: {
          ':query': normalizedQuery,
        },
        Limit: 500,
        ...(lastKey && { ExclusiveStartKey: lastKey }),
      })
    );

    const items = (result.Items || []) as Account[];
    allMatches.push(...items);
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    scanCount++;
  } while (lastKey && allMatches.length < limit * 3 && scanCount < MAX_SCANS);

  // Filter banned accounts, then sort: exact matches first, then substring matches
  return allMatches
    .filter((a) => a.username.includes(normalizedQuery) && !a.isBanned)
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
 * Get season ranks for accounts using DailySnapshot data.
 * Uses the same data source as the leaderboard table (snapshot + banned filter + re-rank)
 * to ensure rank consistency between search results and displayed leaderboard.
 */
async function getSeasonRanks(
  seasonId: string,
  accountIds: string[]
): Promise<Map<string, { userScore: number; rank: number }>> {
  const rankMap = new Map<string, { userScore: number; rank: number }>();

  // Look up season to determine correct snapshot date (ended seasons use endDate)
  const season = await getSeasonById(seasonId);
  if (!season) {
    return rankMap;
  }

  const isEndedSeason = season.status === 'ended' || season.status === 'archived';
  const { entries } = await getLatestSnapshot(seasonId, isEndedSeason ? season.endDate : undefined);
  if (entries.length === 0) {
    return rankMap;
  }

  // Filter banned and re-rank (same logic as get-leaderboard.ts)
  const bannedIds = await getBannedAccountIds();
  const reranked = computeDisplayRanks(entries, bannedIds);

  // Build rank map for requested accountIds
  const accountIdSet = new Set(accountIds);
  for (const entry of reranked) {
    if (accountIdSet.has(entry.accountId)) {
      rankMap.set(entry.accountId, {
        userScore: entry.userScore || 0,
        rank: entry.rank,
      });
    }
  }

  return rankMap;
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);
  const respond = (status: number, body: object) => createResponse(status, body, requestOrigin);
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return respond(200, { accounts: [], total: 0 });
  }

  try {
    const query = event.queryStringParameters?.q;
    const limitStr = event.queryStringParameters?.limit;
    const seasonId = event.queryStringParameters?.seasonId;

    if (!query) {
      return respond(400, { error: 'Query parameter "q" is required' });
    }

    // Parse limit (default 10, max 20)
    let limit = parseInt(limitStr || '10', 10);
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 20) limit = 20;

    // Search accounts
    const accounts = await searchAccounts(query, limit);

    if (accounts.length === 0) {
      return respond(200, { accounts: [], total: 0 });
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

    return respond(200, {
      accounts: results,
      total: results.length,
    });
  } catch (error) {
    console.error('Error searching accounts:', error);
    return respond(500, { error: 'Internal server error' });
  }
};
