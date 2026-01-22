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
  Season,
  SeasonAccountScore,
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
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
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
  originalUsername?: string; // Original casing for display
  accountRole: AccountRole;
  contentSignals: ContentSignal[];
  createdBy: string;
  seasonId?: string; // If not provided, will use active season
}): Promise<{ post: Post; account: Account; seasonAccountScore?: SeasonAccountScore }> {
  const { normalizedUrl, rawUrl, platform, username, originalUsername, accountRole, contentSignals, createdBy } =
    params;

  // Get active season if seasonId not provided
  let seasonId = params.seasonId;
  if (!seasonId) {
    const activeSeason = await getActiveSeason();
    seasonId = activeSeason?.seasonId;
  }

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
    account = await createAccount(platform, username, accountRole, profileData, originalUsername);
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
    seasonId, // Phase 5: Season assignment
  };

  // Save post
  await docClient.send(
    new PutCommand({
      TableName: POSTS_TABLE,
      Item: post,
    })
  );

  // Update account aggregates (cumulative)
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
    originalUsername, // Backfill for legacy accounts without originalUsername
  });

  // Phase 5: Update season-specific aggregates if seasonId exists
  let seasonAccountScore: SeasonAccountScore | undefined;
  if (seasonId) {
    seasonAccountScore = await updateSeasonAccountAggregates({
      seasonId,
      accountId: account.accountId,
      username: account.username,
      originalUsername: account.originalUsername || originalUsername,
      platform: account.platform,
      postScoreToAdd: postScore,
      signalCountToAdd: bonusSignalCount,
      todayDate,
      lastSeenAt: now,
      displayName: account.displayName,
      profileImageUrl: account.profileImageUrl,
      isRegistered: account.isRegistered,
    });
  }

  return { post, account: updatedAccount, seasonAccountScore };
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
  },
  originalUsername?: string
): Promise<Account> {
  const now = new Date().toISOString();

  const account: Account = {
    accountId: uuidv4(),
    platform,
    username: username.toLowerCase(),
    originalUsername: originalUsername || username, // Preserve original casing
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
 * Also backfills originalUsername for legacy accounts that don't have it
 */
export async function updateAccountAggregates(params: {
  accountId: string;
  postScoreToAdd: number;
  signalCountToAdd: number;
  newActiveDates: string[];
  isNewDay: boolean;
  newLastKnownRole: AccountRole;
  lastSeenAt: string;
  originalUsername?: string; // For backfilling legacy accounts
}): Promise<Account> {
  const {
    accountId,
    postScoreToAdd,
    signalCountToAdd,
    newActiveDates,
    isNewDay,
    newLastKnownRole,
    lastSeenAt,
    originalUsername,
  } = params;

  // Build update expression - conditionally include originalUsername
  // Only set if provided and account doesn't have it (attribute_not_exists or empty)
  let updateExpression = `
    SET totalPostScore = totalPostScore + :postScore,
        postCount = postCount + :one,
        signalCountTotal = signalCountTotal + :signalCount,
        activeDates = :activeDates,
        uniqueActiveDays = :uniqueDays,
        lastKnownRole = :role,
        lastSeenAt = :lastSeen
  `;

  const expressionAttributeValues: Record<string, unknown> = {
    ':postScore': postScoreToAdd,
    ':one': 1,
    ':signalCount': signalCountToAdd,
    ':activeDates': newActiveDates,
    ':uniqueDays': newActiveDates.length,
    ':role': newLastKnownRole,
    ':lastSeen': lastSeenAt,
  };

  // Backfill originalUsername if provided
  if (originalUsername) {
    updateExpression += `, originalUsername = if_not_exists(originalUsername, :origUser)`;
    expressionAttributeValues[':origUser'] = originalUsername;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
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

// ============================================
// Season Operations (Phase 5)
// ============================================

/**
 * Get the currently active season
 */
export async function getActiveSeason(): Promise<Season | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: 'sk = :sk AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':sk': 'METADATA',
        ':status': 'active',
      },
    })
  );

  if (result.Items && result.Items.length > 0) {
    return result.Items[0] as Season;
  }
  return null;
}

/**
 * Get a season by ID
 */
export async function getSeasonById(seasonId: string): Promise<Season | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: SEASONS_TABLE,
      Key: { seasonId, sk: 'METADATA' },
    })
  );

  return (result.Item as Season) || null;
}

/**
 * Update season-specific account aggregates
 */
export async function updateSeasonAccountAggregates(params: {
  seasonId: string;
  accountId: string;
  username: string;
  originalUsername?: string;
  platform: Platform;
  postScoreToAdd: number;
  signalCountToAdd: number;
  todayDate: string;
  lastSeenAt: string;
  displayName?: string;
  profileImageUrl?: string;
  isRegistered?: boolean;
}): Promise<SeasonAccountScore> {
  const {
    seasonId,
    accountId,
    username,
    originalUsername,
    platform,
    postScoreToAdd,
    signalCountToAdd,
    todayDate,
    lastSeenAt,
    displayName,
    profileImageUrl,
    isRegistered,
  } = params;

  const pk = `SEASON#${seasonId}#ACCOUNT#${accountId}`;
  const sk = 'SCORE';

  // Try to get existing record
  const existing = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: { pk, sk },
    })
  );

  if (existing.Item) {
    // Update existing record
    const existingRecord = existing.Item as SeasonAccountScore;
    const { dates: newActiveDates, isNewDay } = addActiveDate(
      existingRecord.activeDates || [],
      todayDate
    );

    // Calculate new aggregates
    const newTotalPostScore = existingRecord.totalPostScore + postScoreToAdd;
    const newPostCount = existingRecord.postCount + 1;
    const newSignalCount = existingRecord.signalCountTotal + signalCountToAdd;
    const newUniqueDays = newActiveDates.length;

    // Recalculate scores
    const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
      calculateSeasonUserScore({
        totalPostScore: newTotalPostScore,
        postCount: newPostCount,
        uniqueActiveDays: newUniqueDays,
        lastSeenAt,
      });

    // Build update expression dynamically to avoid undefined values
    const updateParts = [
      'totalPostScore = :totalPostScore',
      'postCount = :postCount',
      'signalCountTotal = :signalCount',
      'activeDates = :activeDates',
      'uniqueActiveDays = :uniqueDays',
      'userScore = :userScore',
      'rawScore = :rawScore',
      'consistencyBonus = :consistencyBonus',
      'freshnessMultiplier = :freshnessMultiplier',
      'lastSeenAt = :lastSeen',
      'isRegistered = :isRegistered',
    ];

    const expressionValues: Record<string, unknown> = {
      ':totalPostScore': newTotalPostScore,
      ':postCount': newPostCount,
      ':signalCount': newSignalCount,
      ':activeDates': newActiveDates,
      ':uniqueDays': newUniqueDays,
      ':userScore': userScore,
      ':rawScore': rawScore,
      ':consistencyBonus': consistencyBonus,
      ':freshnessMultiplier': freshnessMultiplier,
      ':lastSeen': lastSeenAt,
      ':isRegistered': isRegistered ?? false,
    };

    // Only include optional profile fields if they have values
    if (originalUsername !== undefined) {
      updateParts.push('originalUsername = :originalUsername');
      expressionValues[':originalUsername'] = originalUsername;
    }
    if (displayName !== undefined) {
      updateParts.push('displayName = :displayName');
      expressionValues[':displayName'] = displayName;
    }
    if (profileImageUrl !== undefined) {
      updateParts.push('profileImageUrl = :profileImageUrl');
      expressionValues[':profileImageUrl'] = profileImageUrl;
    }

    const result = await docClient.send(
      new UpdateCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        Key: { pk, sk },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW',
      })
    );

    return result.Attributes as SeasonAccountScore;
  } else {
    // Create new record
    const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
      calculateSeasonUserScore({
        totalPostScore: postScoreToAdd,
        postCount: 1,
        uniqueActiveDays: 1,
        lastSeenAt,
      });

    const newRecord: SeasonAccountScore = {
      pk,
      sk,
      accountId,
      seasonId,
      username,
      originalUsername,
      platform,
      totalPostScore: postScoreToAdd,
      postCount: 1,
      signalCountTotal: signalCountToAdd,
      uniqueActiveDays: 1,
      activeDates: [todayDate],
      userScore,
      rawScore,
      consistencyBonus,
      freshnessMultiplier,
      displayName,
      profileImageUrl,
      isRegistered: isRegistered ?? false,
      firstSeenAt: lastSeenAt,
      lastSeenAt,
    };

    await docClient.send(
      new PutCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        Item: newRecord,
      })
    );

    return newRecord;
  }
}

/**
 * Calculate user score for season leaderboard
 */
function calculateSeasonUserScore(params: {
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastSeenAt: string;
}): {
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  userScore: number;
} {
  const { totalPostScore, postCount, uniqueActiveDays, lastSeenAt } = params;

  // RawScore = totalPostScore × log₂(postCount + 1) / postCount
  const effectivePosts = Math.log2(postCount + 1);
  const rawScore = postCount > 0 ? (totalPostScore * effectivePosts) / postCount : 0;

  // ConsistencyBonus = 1 + log₂(uniqueActiveDays + 1) × 0.1
  const consistencyBonus = 1 + Math.log2(uniqueActiveDays + 1) * 0.1;

  // FreshnessMultiplier = 1 / (1 + daysSinceLastPost / 14)
  const daysSinceLastPost = Math.floor(
    (Date.now() - new Date(lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const freshnessMultiplier = 1 / (1 + daysSinceLastPost / 14);

  // UserScore = rawScore × consistencyBonus × freshnessMultiplier
  const userScore = rawScore * consistencyBonus * freshnessMultiplier;

  return {
    rawScore: Math.round(rawScore * 1000) / 1000,
    consistencyBonus: Math.round(consistencyBonus * 1000) / 1000,
    freshnessMultiplier: Math.round(freshnessMultiplier * 1000) / 1000,
    userScore: Math.round(userScore * 1000) / 1000,
  };
}

/**
 * Get all season account scores for a season
 */
export async function getSeasonAccountScores(seasonId: string): Promise<SeasonAccountScore[]> {
  const scores: SeasonAccountScore[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        FilterExpression: 'seasonId = :seasonId AND sk = :sk',
        ExpressionAttributeValues: {
          ':seasonId': seasonId,
          ':sk': 'SCORE',
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      scores.push(...(result.Items as SeasonAccountScore[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return scores;
}
