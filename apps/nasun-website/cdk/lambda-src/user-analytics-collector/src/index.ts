/**
 * User Analytics Collector
 *
 * Collects daily user metrics (registered users, leaderboard accounts,
 * telegram members, X-connected accounts) and stores snapshots in DynamoDB.
 *
 * Trigger: EventBridge (daily at 00:45 UTC) or manual invoke.
 * Supports backfill mode to generate historical data from createdAt/firstSeenAt.
 *
 * Stores data in the existing devnet-metrics table with USER_METRICS# prefix.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const METRICS_TABLE = process.env.DEVNET_METRICS_TABLE || 'devnet-metrics';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const ACCOUNTS_TABLE = process.env.LEADERBOARD_ACCOUNTS_TABLE || 'leaderboard-v3-accounts';

interface UserMetricsRecord {
  pk: string; // USER_METRICS#YYYY-MM-DD
  sk: string; // DAILY
  registeredUsers: number;
  leaderboardAccounts: number;
  telegramMembers: number;
  xConnected: number;
  collectedAt: string;
}

interface CollectorEvent {
  backfill?: boolean;
  startDate?: string; // YYYY-MM-DD, required when backfill=true
  force?: boolean;
}

interface UserProfileItem {
  createdAt?: string;
  isTelegramMember?: boolean;
  twitterHandle?: string;
}

interface AccountItem {
  firstSeenAt?: string;
}

function getYesterdayDateString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Scan UserProfiles table once and compute all counters simultaneously.
 */
async function scanUserProfileCounts(): Promise<{
  total: number;
  telegramMembers: number;
  xConnected: number;
}> {
  let total = 0;
  let telegramMembers = 0;
  let xConnected = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: USER_PROFILES_TABLE,
      ProjectionExpression: 'isTelegramMember, twitterHandle',
      ExclusiveStartKey: lastKey,
    }));

    for (const item of result.Items ?? []) {
      total++;
      if (item.isTelegramMember === true) telegramMembers++;
      if (item.twitterHandle) xConnected++;
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return { total, telegramMembers, xConnected };
}

/**
 * Count total leaderboard accounts.
 */
async function countLeaderboardAccounts(): Promise<number> {
  let count = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      Select: 'COUNT',
      ExclusiveStartKey: lastKey,
    }));
    count += result.Count || 0;
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return count;
}

/**
 * Check if a metrics record already exists for a given date.
 */
async function metricsExist(dateStr: string): Promise<boolean> {
  const result = await docClient.send(new GetCommand({
    TableName: METRICS_TABLE,
    Key: { pk: `USER_METRICS#${dateStr}`, sk: 'DAILY' },
    ProjectionExpression: 'pk',
  }));
  return !!result.Item;
}

/**
 * Save metrics with optional idempotency guard.
 * When skipIfExists=true, uses ConditionExpression to protect existing snapshots.
 */
async function saveMetrics(record: UserMetricsRecord, skipIfExists: boolean): Promise<boolean> {
  try {
    await docClient.send(new PutCommand({
      TableName: METRICS_TABLE,
      Item: record,
      ...(skipIfExists && {
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    }));
    return true;
  } catch (err: unknown) {
    if (skipIfExists && err instanceof Error && err.name === 'ConditionalCheckFailedException') {
      return false; // Already exists, skipped
    }
    throw err;
  }
}

/**
 * Daily collection mode: scan current counts and save snapshot.
 */
async function collectDaily(force: boolean): Promise<void> {
  const targetDate = getYesterdayDateString();
  console.log(`Collecting user metrics for ${targetDate} (force=${force})`);

  // Idempotency check
  if (!force) {
    const exists = await metricsExist(targetDate);
    if (exists) {
      console.log(`User metrics for ${targetDate} already exist. Skipping. Use force=true to override.`);
      return;
    }
  }

  // Collect counts in parallel
  const [userCounts, leaderboardAccounts] = await Promise.all([
    scanUserProfileCounts(),
    countLeaderboardAccounts(),
  ]);

  const record: UserMetricsRecord = {
    pk: `USER_METRICS#${targetDate}`,
    sk: 'DAILY',
    registeredUsers: userCounts.total,
    leaderboardAccounts,
    telegramMembers: userCounts.telegramMembers,
    xConnected: userCounts.xConnected,
    collectedAt: new Date().toISOString(),
  };

  // When force=true, overwrite; otherwise protect existing
  await saveMetrics(record, !force);
  console.log(`User metrics saved: registered=${record.registeredUsers}, leaderboard=${record.leaderboardAccounts}, telegram=${record.telegramMembers}, x=${record.xConnected}`);
}

/**
 * Backfill mode: generate historical snapshots from createdAt/firstSeenAt.
 * Assumes telegram/X connection date equals account creation date.
 * Uses ConditionExpression to protect any real snapshots that already exist.
 */
async function backfill(startDate: string): Promise<void> {
  const today = getTodayDateString();
  console.log(`Backfilling user metrics from ${startDate} to ${today}`);

  // Load all user profiles
  console.log('Loading UserProfiles...');
  const profiles: UserProfileItem[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: USER_PROFILES_TABLE,
      ProjectionExpression: 'createdAt, isTelegramMember, twitterHandle',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      profiles.push(item as UserProfileItem);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Loaded ${profiles.length} user profiles`);

  // Load all leaderboard accounts
  console.log('Loading leaderboard accounts...');
  const accounts: AccountItem[] = [];
  lastKey = undefined;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: ACCOUNTS_TABLE,
      ProjectionExpression: 'firstSeenAt',
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      accounts.push(item as AccountItem);
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Loaded ${accounts.length} leaderboard accounts`);

  // Build daily cumulative counts
  // For each date, count how many profiles/accounts existed by that date
  const dateCounters = new Map<string, {
    registeredUsers: number;
    telegramMembers: number;
    xConnected: number;
    leaderboardAccounts: number;
  }>();

  // Sort profiles/accounts by date to build cumulative counts efficiently
  const profileDates = profiles
    .map(p => p.createdAt?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort();

  const accountDates = accounts
    .map(a => a.firstSeenAt?.slice(0, 10))
    .filter((d): d is string => !!d)
    .sort();

  // Generate all dates from startDate to today
  const allDates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);

  while (current <= end) {
    allDates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  // Count cumulative profiles per date
  let cumRegistered = 0;
  let cumTelegram = 0;
  let cumX = 0;
  let profileIdx = 0;

  // Pre-sort profile data with telegram/x flags
  const profileEntries = profiles
    .filter(p => p.createdAt)
    .map(p => ({
      date: p.createdAt!.slice(0, 10),
      isTelegram: p.isTelegramMember === true,
      isX: !!p.twitterHandle,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let accountIdx = 0;
  let cumAccounts = 0;

  for (const date of allDates) {
    // Add profiles created on or before this date
    while (profileIdx < profileEntries.length && profileEntries[profileIdx].date <= date) {
      cumRegistered++;
      if (profileEntries[profileIdx].isTelegram) cumTelegram++;
      if (profileEntries[profileIdx].isX) cumX++;
      profileIdx++;
    }

    // Add accounts first seen on or before this date
    while (accountIdx < accountDates.length && accountDates[accountIdx] <= date) {
      cumAccounts++;
      accountIdx++;
    }

    dateCounters.set(date, {
      registeredUsers: cumRegistered,
      telegramMembers: cumTelegram,
      xConnected: cumX,
      leaderboardAccounts: cumAccounts,
    });
  }

  // Save each date's snapshot (protect existing real snapshots)
  let saved = 0;
  let skipped = 0;

  for (const [date, counts] of dateCounters) {
    const record: UserMetricsRecord = {
      pk: `USER_METRICS#${date}`,
      sk: 'DAILY',
      registeredUsers: counts.registeredUsers,
      leaderboardAccounts: counts.leaderboardAccounts,
      telegramMembers: counts.telegramMembers,
      xConnected: counts.xConnected,
      collectedAt: new Date().toISOString(),
    };

    const didSave = await saveMetrics(record, true); // Always protect existing
    if (didSave) {
      saved++;
    } else {
      skipped++;
    }
  }

  console.log(`Backfill complete: ${saved} saved, ${skipped} skipped (already exist)`);
}

export async function handler(event: CollectorEvent): Promise<void> {
  const startTime = Date.now();

  if (event.backfill) {
    if (!event.startDate) {
      throw new Error('startDate is required for backfill mode');
    }
    await backfill(event.startDate);
  } else {
    await collectDaily(event.force === true);
  }

  console.log(`Done in ${Date.now() - startTime}ms`);
}
