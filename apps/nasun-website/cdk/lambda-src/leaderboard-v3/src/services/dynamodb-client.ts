/**
 * DynamoDB Client for Leaderboard V3
 *
 * Provides data access layer for posts and accounts tables.
 * Completely independent from v2 leaderboard system.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  Account,
  AccountRole,
  ContentSignal,
  DYNAMO_KEYS,
  Platform,
  Post,
} from '../types';
import {
  addActiveDate,
  calculatePostScore,
  countBonusSignals,
  getTodayDateString,
} from './score-calculator';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Table names from environment or defaults
const POSTS_TABLE =
  process.env.LEADERBOARD_V3_POSTS_TABLE || DYNAMO_KEYS.POSTS_TABLE;
const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

// UserProfiles table structure (from auth-twitter Lambda)
interface UserProfileRecord {
  identityId: string;
  username: string; // Display name
  twitterHandle: string; // @handle
  profileImageUrl?: string;
}

// ============================================
// Posts Operations
// ============================================

/**
 * Check if a post URL already exists
 */
export async function getPostByUrl(normalizedUrl: string): Promise<Post | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: POSTS_TABLE,
      IndexName: DYNAMO_KEYS.POSTS_URL_INDEX,
      KeyConditionExpression: 'postUrl = :url',
      ExpressionAttributeValues: {
        ':url': normalizedUrl,
      },
      Limit: 1,
    })
  );

  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as Post;
  }
  return null;
}

/**
 * Create a new post and update the associated account
 */
export async function createPost(params: {
  normalizedUrl: string;
  rawUrl: string;
  platform: Platform;
  username: string;
  accountRole: AccountRole;
  contentSignals: ContentSignal[];
  createdBy: string;
}): Promise<{ post: Post; account: Account }> {
  const { normalizedUrl, rawUrl, platform, username, accountRole, contentSignals, createdBy } =
    params;

  // Get or create account
  let account = await getAccountByUsername(platform, username);
  const isNewAccount = !account;

  if (!account) {
    // Lookup profile data from UserProfiles table (for X users)
    let profileData: {
      displayName?: string;
      profileImageUrl?: string;
      isRegistered?: boolean;
    } | undefined;

    if (platform === 'twitter') {
      const userProfile = await lookupUserProfile(username);
      if (userProfile) {
        profileData = userProfile;
      }
    }

    // Create new account with profile data
    account = await createAccount(platform, username, accountRole, profileData);
  }

  // Calculate post score
  const { baseScore, roleMultiplier, signalBonus, postScore } = calculatePostScore(
    accountRole,
    contentSignals
  );

  const now = new Date().toISOString();
  const todayDate = getTodayDateString();

  // Create post record
  const post: Post = {
    postId: uuidv4(),
    platform,
    postUrl: normalizedUrl,
    postUrlRaw: rawUrl,
    accountId: account.accountId,
    username,
    accountRole,
    contentSignals,
    baseScore,
    roleMultiplier,
    signalBonus,
    postScore,
    createdAt: now,
    createdBy,
  };

  // Save post
  await docClient.send(
    new PutCommand({
      TableName: POSTS_TABLE,
      Item: post,
    })
  );

  // Update account aggregates
  const { dates: newActiveDates, isNewDay } = addActiveDate(
    account.activeDates || [],
    todayDate
  );
  const bonusSignalCount = countBonusSignals(contentSignals);

  const updatedAccount = await updateAccountAggregates({
    accountId: account.accountId,
    postScoreToAdd: postScore,
    signalCountToAdd: bonusSignalCount,
    newActiveDates,
    isNewDay,
    newLastKnownRole: accountRole,
    lastSeenAt: now,
  });

  return { post, account: updatedAccount };
}

/**
 * Get recent posts for an account
 */
export async function getPostsByAccountId(
  accountId: string,
  limit = 10
): Promise<Post[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: POSTS_TABLE,
      FilterExpression: 'accountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': accountId,
      },
      Limit: limit,
    })
  );

  return (result.Items || []) as Post[];
}

// ============================================
// Accounts Operations
// ============================================

/**
 * Get account by platform and username
 */
export async function getAccountByUsername(
  platform: Platform,
  username: string
): Promise<Account | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: ACCOUNTS_TABLE,
      IndexName: DYNAMO_KEYS.ACCOUNTS_USERNAME_INDEX,
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: {
        ':platform': platform,
        ':username': username.toLowerCase(),
      },
      Limit: 1,
    })
  );

  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as Account;
  }
  return null;
}

/**
 * Get account by ID
 */
export async function getAccountById(accountId: string): Promise<Account | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
    })
  );

  return (result.Item as Account) || null;
}

/**
 * Lookup user profile from UserProfiles table using twitterHandle-index GSI
 * Returns profile data if the user has logged in to Nasun website
 */
export async function lookupUserProfile(twitterHandle: string): Promise<{
  displayName: string;
  profileImageUrl?: string;
  isRegistered: boolean;
} | null> {
  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: USER_PROFILES_TABLE,
        IndexName: 'twitterHandle-index',
        KeyConditionExpression: 'twitterHandle = :handle',
        ExpressionAttributeValues: {
          ':handle': twitterHandle.toLowerCase(),
        },
        Limit: 1,
      })
    );

    if (result.Items && result.Items.length > 0) {
      const profile = result.Items[0] as UserProfileRecord;
      return {
        displayName: profile.username,
        profileImageUrl: profile.profileImageUrl,
        isRegistered: true,
      };
    }
    return null;
  } catch (error) {
    console.warn('Failed to lookup user profile:', error);
    return null;
  }
}

/**
 * Create a new account
 */
export async function createAccount(
  platform: Platform,
  username: string,
  role: AccountRole,
  profileData?: {
    displayName?: string;
    profileImageUrl?: string;
    isRegistered?: boolean;
  }
): Promise<Account> {
  const now = new Date().toISOString();

  const account: Account = {
    accountId: uuidv4(),
    platform,
    username: username.toLowerCase(),
    lastKnownRole: role,
    displayName: profileData?.displayName,
    profileImageUrl: profileData?.profileImageUrl,
    isRegistered: profileData?.isRegistered ?? false,
    totalPostScore: 0,
    postCount: 0,
    signalCountTotal: 0,
    uniqueActiveDays: 0,
    activeDates: [],
    firstSeenAt: now,
    lastSeenAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: ACCOUNTS_TABLE,
      Item: account,
    })
  );

  return account;
}

/**
 * Update account aggregates after adding a post
 */
export async function updateAccountAggregates(params: {
  accountId: string;
  postScoreToAdd: number;
  signalCountToAdd: number;
  newActiveDates: string[];
  isNewDay: boolean;
  newLastKnownRole: AccountRole;
  lastSeenAt: string;
}): Promise<Account> {
  const {
    accountId,
    postScoreToAdd,
    signalCountToAdd,
    newActiveDates,
    isNewDay,
    newLastKnownRole,
    lastSeenAt,
  } = params;

  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: `
        SET totalPostScore = totalPostScore + :postScore,
            postCount = postCount + :one,
            signalCountTotal = signalCountTotal + :signalCount,
            activeDates = :activeDates,
            uniqueActiveDays = :uniqueDays,
            lastKnownRole = :role,
            lastSeenAt = :lastSeen
      `,
      ExpressionAttributeValues: {
        ':postScore': postScoreToAdd,
        ':one': 1,
        ':signalCount': signalCountToAdd,
        ':activeDates': newActiveDates,
        ':uniqueDays': newActiveDates.length,
        ':role': newLastKnownRole,
        ':lastSeen': lastSeenAt,
      },
      ReturnValues: 'ALL_NEW',
    })
  );

  return result.Attributes as Account;
}

/**
 * Get all accounts for leaderboard calculation
 */
export async function getAllAccounts(): Promise<Account[]> {
  const accounts: Account[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      accounts.push(...(result.Items as Account[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return accounts;
}

/**
 * Get accounts with posts in a specific date range
 * Used for weekly/monthly leaderboards
 */
export async function getAccountsWithPostsInRange(
  startDate: string,
  endDate: string
): Promise<Account[]> {
  // For now, we'll filter in memory after scanning
  // In production with large data, consider using a GSI on createdAt
  const allAccounts = await getAllAccounts();

  // Filter accounts that have activity in the date range
  return allAccounts.filter((account) => {
    const activeDates = account.activeDates || [];
    return activeDates.some((date) => date >= startDate && date <= endDate);
  });
}
