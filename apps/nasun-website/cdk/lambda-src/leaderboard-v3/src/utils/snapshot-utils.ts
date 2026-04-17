/**
 * Shared snapshot ranking utilities (READ ONLY).
 *
 * These functions query the DailySnapshot table and compute display ranks
 * by filtering banned accounts and re-assigning rank positions.
 * They NEVER write to DynamoDB.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DailySnapshot, DYNAMO_KEYS } from '../types';
import { getTodayDateString } from './date';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const SNAPSHOTS_TABLE =
  process.env.LEADERBOARD_V3_SNAPSHOTS_TABLE || DYNAMO_KEYS.SNAPSHOTS_TABLE;

const MAX_FALLBACK_DAYS = 7;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * Find the absolute latest snapshot date available in the table for a season.
 * This is used when the 7-day fallback fails.
 */
async function findAbsoluteLatestDate(seasonId: string): Promise<string | null> {
  const dates = new Set<string>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  try {
    do {
      // Light scan to get only PKs to identify available dates
      const result = await docClient.send(
        new ScanCommand({
          TableName: SNAPSHOTS_TABLE,
          ProjectionExpression: 'pk',
          FilterExpression: 'begins_with(pk, :prefix)',
          ExpressionAttributeValues: { ':prefix': `${seasonId}#` },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (result.Items) {
        for (const item of result.Items) {
          const pk = item.pk as string;
          const datePart = pk.split('#')[1];
          if (datePart) dates.add(datePart);
        }
      }
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastEvaluatedKey);

    if (dates.size === 0) return null;

    // Return the lexicographically largest date (newest YYYY-MM-DD)
    return Array.from(dates).sort().reverse()[0];
  } catch (error) {
    console.error('Error finding absolute latest date:', error);
    return null;
  }
}

/**
 * Query a snapshot for a specific date.
 * Returns all entries sorted by rank (DynamoDB SK order).
 */
export async function querySnapshot(
  seasonId: string,
  snapshotDate: string
): Promise<DailySnapshot[]> {
  const pk = `${seasonId}#${snapshotDate}`;
  const items: DailySnapshot[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: SNAPSHOTS_TABLE,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (result.Items) {
      items.push(...(result.Items as DailySnapshot[]));
    }
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Query the most recent snapshot for a season, with up to 7-day fallback.
 * If no snapshot found within 7 days, it searches for the absolute latest available in the table.
 * For active seasons: falls back from today (KST).
 * For ended seasons: pass endDate as referenceDate to fall back from season end.
 * Returns all entries sorted by rank (DynamoDB SK order).
 */
export async function getLatestSnapshot(
  seasonId: string,
  referenceDate?: string
): Promise<{ entries: DailySnapshot[]; date: string }> {
  // 1. Try efficient 7-day fallback first (fast path)
  for (let daysBack = 0; daysBack <= MAX_FALLBACK_DAYS; daysBack++) {
    let dateStr: string;
    if (referenceDate) {
      const dateObj = new Date(referenceDate);
      dateObj.setDate(dateObj.getDate() - daysBack);
      dateStr = dateObj.toISOString().split('T')[0];
    } else {
      const date = new Date();
      date.setTime(date.getTime() + KST_OFFSET_MS);
      date.setDate(date.getDate() - daysBack);
      dateStr = date.toISOString().split('T')[0];
    }

    const items = await querySnapshot(seasonId, dateStr);
    if (items.length > 0) {
      return { entries: items, date: dateStr };
    }
  }

  // 2. If 7-day fallback fails, find the absolute latest date available (robust path)
  console.log(`No snapshot found for ${seasonId} within ${MAX_FALLBACK_DAYS} days. Searching for absolute latest snapshot...`);
  const absoluteLatestDate = await findAbsoluteLatestDate(seasonId);
  
  if (absoluteLatestDate) {
    console.log(`Found absolute latest snapshot for ${seasonId} on ${absoluteLatestDate}`);
    const items = await querySnapshot(seasonId, absoluteLatestDate);
    return { entries: items, date: absoluteLatestDate };
  }

  // Fallback to today empty state
  return { entries: [], date: getTodayDateString() };
}

/**
 * Filter banned accounts from snapshot entries and re-assign rank positions.
 * Returns a new array (does not mutate input). Entries must be pre-sorted by rank.
 */
export function computeDisplayRanks(
  snapshots: DailySnapshot[],
  bannedIds: Set<string>
): DailySnapshot[] {
  return snapshots
    .filter((s) => !bannedIds.has(s.accountId))
    .map((s, index) => ({ ...s, rank: index + 1 }));
}

/**
 * Count how many banned accounts have a raw rank at or above the given rank.
 * Uses SK range query to load only entries up to the user's rank (lightweight).
 */
export async function countBannedAboveRank(
  seasonId: string,
  snapshotDate: string,
  rawRank: number,
  bannedIds: Set<string>
): Promise<number> {
  const pk = `${seasonId}#${snapshotDate}`;
  const maxSk = `RANK#${String(rawRank).padStart(4, '0')}`;

  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk <= :maxSk',
      ExpressionAttributeValues: { ':pk': pk, ':maxSk': maxSk },
      ProjectionExpression: 'accountId',
    })
  );

  const items = result.Items || [];
  let count = 0;
  for (const item of items) {
    if (bannedIds.has((item as { accountId: string }).accountId)) {
      count++;
    }
  }
  return count;
}

/**
 * Get total displayed users (snapshot count minus banned accounts in snapshot).
 * Queries all snapshot accountIds with ProjectionExpression for efficiency.
 */
export async function getDisplayedTotalUsers(
  seasonId: string,
  snapshotDate: string,
  bannedIds: Set<string>
): Promise<number> {
  const pk = `${seasonId}#${snapshotDate}`;
  const result = await docClient.send(
    new QueryCommand({
      TableName: SNAPSHOTS_TABLE,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ProjectionExpression: 'accountId',
    })
  );

  const items = result.Items || [];
  let bannedCount = 0;
  for (const item of items) {
    if (bannedIds.has((item as { accountId: string }).accountId)) {
      bannedCount++;
    }
  }
  return items.length - bannedCount;
}
