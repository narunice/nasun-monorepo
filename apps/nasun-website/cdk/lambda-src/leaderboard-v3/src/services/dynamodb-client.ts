/**
 * DynamoDB Client for Leaderboard V3
 *
 * Provides data access layer for posts and accounts tables.
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
  AccountLanguage,
  AccountRole,
  ContentSignal,
  DYNAMO_KEYS,
  Platform,
  Post,
  PostType,
  Season,
  SeasonAccountScore,
} from '../types';
import {
  addActiveDate,
  calculatePostScore,
  calculatePostScoreWithFollowers,
  calculateScoreComponents,
  countBonusSignals,
} from './score-calculator';
import { getTodayDateString } from '../utils/date';

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
  postType?: PostType; // Phase 9: original, quote, or reply (default: original)
  createdBy: string;
  seasonId?: string; // If not provided, will use active season
  // For new users: language and follower count for role calculation
  language?: AccountLanguage;
  followerCount?: number;
}): Promise<{ post: Post; account: Account; seasonAccountScore?: SeasonAccountScore }> {
  const {
    normalizedUrl,
    rawUrl,
    platform,
    username,
    originalUsername,
    accountRole,
    contentSignals,
    postType = 'original',
    createdBy,
    language,
    followerCount,
  } = params;

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

    // Create new account with profile data and language info
    account = await createAccount(
      platform,
      username,
      accountRole,
      profileData,
      originalUsername,
      language || followerCount ? { language, followerCount } : undefined
    );
  }

  // Calculate post score using continuous role multiplier
  // Prefer params for new accounts, fallback to account data for existing accounts
  const effectiveFollowerCount = isNewAccount
    ? (followerCount ?? 0)
    : (account.followerCount ?? followerCount ?? 0);
  const effectiveLanguage: AccountLanguage = isNewAccount
    ? (language || 'en')
    : (account.language || language || 'en');

  const { baseScore, postTypeMultiplier, roleMultiplier, signalBonus, postScore } = calculatePostScoreWithFollowers(
    effectiveFollowerCount,
    effectiveLanguage,
    contentSignals,
    postType
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
    postType,
    baseScore,
    postTypeMultiplier,
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
    postType, // Phase 9: For per-type aggregation
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
      isTelegramMember: account.isTelegramMember,
      postType, // Phase 9: For per-type aggregation
    });
  }

  return { post, account: updatedAccount, seasonAccountScore };
}

/**
 * Get a post by its ID
 */
export async function getPostById(postId: string): Promise<Post | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
    })
  );

  return (result.Item as Post) || null;
}

/**
 * Update a post's editable fields and adjust season/cumulative account aggregates
 * When postScore changes, adjusts totalPostScore and per-type scores via delta
 */
export async function updatePostAndAdjustScores(params: {
  postId: string;
  updates: {
    platform?: Platform;
    username?: string;
    originalUsername?: string;
    postScore?: number;
    contentSignals?: ContentSignal[];
    accountRole?: AccountRole;
    postType?: PostType;
  };
}): Promise<Post> {
  const { postId, updates } = params;

  const existingPost = await getPostById(postId);
  if (!existingPost) {
    throw new Error(`Post ${postId} not found`);
  }

  // Build update expression
  const updateParts: string[] = [];
  const expressionValues: Record<string, unknown> = {};
  const expressionNames: Record<string, string> = {};

  if (updates.contentSignals !== undefined) {
    updateParts.push('contentSignals = :contentSignals');
    expressionValues[':contentSignals'] = updates.contentSignals;
  }
  if (updates.accountRole !== undefined) {
    updateParts.push('accountRole = :accountRole');
    expressionValues[':accountRole'] = updates.accountRole;
  }
  if (updates.postScore !== undefined) {
    updateParts.push('postScore = :postScore');
    expressionValues[':postScore'] = updates.postScore;
  }
  if (updates.platform !== undefined) {
    updateParts.push('platform = :platform');
    expressionValues[':platform'] = updates.platform;
  }
  if (updates.username !== undefined) {
    updateParts.push('#u = :username');
    expressionNames['#u'] = 'username';
    expressionValues[':username'] = updates.username;
  }
  if (updates.originalUsername !== undefined) {
    updateParts.push('originalUsername = :originalUsername');
    expressionValues[':originalUsername'] = updates.originalUsername;
  }
  if (updates.postType !== undefined) {
    updateParts.push('postType = :postType');
    expressionValues[':postType'] = updates.postType;
  }

  updateParts.push('updatedAt = :updatedAt');
  expressionValues[':updatedAt'] = new Date().toISOString();

  if (updateParts.length <= 1) {
    return existingPost;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: POSTS_TABLE,
      Key: { postId },
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ...(Object.keys(expressionNames).length > 0 && {
        ExpressionAttributeNames: expressionNames,
      }),
      ReturnValues: 'ALL_NEW',
    })
  );

  const updatedPost = result.Attributes as Post;

  // Determine what changed for aggregate adjustment
  const validPostTypes: PostType[] = ['original', 'quote', 'reply'];
  const oldType = validPostTypes.includes(existingPost.postType as PostType) ? existingPost.postType : 'original';
  const newType = updates.postType ?? oldType;
  const typeChanged = updates.postType !== undefined && newType !== oldType;
  const scoreChanged = updates.postScore !== undefined && updates.postScore !== existingPost.postScore;

  if (typeChanged) {
    // Post type changed (possibly with score change too)
    // Move count and score from old type to new type
    const oldScore = existingPost.postScore;
    const newScore = updates.postScore ?? oldScore;
    const totalScoreDelta = newScore - oldScore; // 0 if score unchanged

    const oldCountField = `${oldType}PostCount`;
    const oldScoreField = `${oldType}TotalScore`;
    const newCountField = `${newType}PostCount`;
    const newScoreField = `${newType}TotalScore`;

    // Adjust season account aggregates
    if (existingPost.seasonId) {
      const pk = `SEASON#${existingPost.seasonId}#ACCOUNT#${existingPost.accountId}`;
      const sk = 'SCORE';

      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk, sk },
          UpdateExpression: `SET
            ${oldCountField} = if_not_exists(${oldCountField}, :zero) - :one,
            ${oldScoreField} = if_not_exists(${oldScoreField}, :zero) - :oldScore,
            ${newCountField} = if_not_exists(${newCountField}, :zero) + :one,
            ${newScoreField} = if_not_exists(${newScoreField}, :zero) + :newScore,
            totalPostScore = totalPostScore + :totalDelta`,
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':oldScore': oldScore,
            ':newScore': newScore,
            ':totalDelta': totalScoreDelta,
          },
        })
      );
    }

    // Adjust cumulative account aggregates
    await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: existingPost.accountId },
        UpdateExpression: `SET
          ${oldCountField} = if_not_exists(${oldCountField}, :zero) - :one,
          ${oldScoreField} = if_not_exists(${oldScoreField}, :zero) - :oldScore,
          ${newCountField} = if_not_exists(${newCountField}, :zero) + :one,
          ${newScoreField} = if_not_exists(${newScoreField}, :zero) + :newScore,
          totalPostScore = totalPostScore + :totalDelta`,
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':oldScore': oldScore,
          ':newScore': newScore,
          ':totalDelta': totalScoreDelta,
        },
      })
    );
  } else if (scoreChanged) {
    // Score-only change (existing behavior preserved)
    const scoreDelta = updates.postScore! - existingPost.postScore;
    const postType = existingPost.postType || 'original';

    // Adjust season account aggregates
    if (existingPost.seasonId) {
      const pk = `SEASON#${existingPost.seasonId}#ACCOUNT#${existingPost.accountId}`;
      const sk = 'SCORE';

      const perTypeField =
        postType === 'original' ? 'originalTotalScore'
        : postType === 'quote' ? 'quoteTotalScore'
        : 'replyTotalScore';

      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk, sk },
          UpdateExpression: `SET totalPostScore = totalPostScore + :delta, ${perTypeField} = if_not_exists(${perTypeField}, :zero) + :delta`,
          ExpressionAttributeValues: {
            ':delta': scoreDelta,
            ':zero': 0,
          },
        })
      );
    }

    // Adjust cumulative account aggregates
    const cumulativePerTypeField =
      postType === 'original' ? 'originalTotalScore'
      : postType === 'quote' ? 'quoteTotalScore'
      : 'replyTotalScore';

    await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: existingPost.accountId },
        UpdateExpression: `SET totalPostScore = totalPostScore + :delta, ${cumulativePerTypeField} = if_not_exists(${cumulativePerTypeField}, :zero) + :delta`,
        ExpressionAttributeValues: {
          ':delta': scoreDelta,
          ':zero': 0,
        },
      })
    );
  }

  return updatedPost;
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
 * Ban an account (soft exclusion)
 */
export async function banAccount(params: {
  accountId: string;
  reason?: string;
  bannedBy: string;
}): Promise<Account> {
  const { accountId, reason, bannedBy } = params;
  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression:
        'SET isBanned = :banned, banReason = :reason, bannedAt = :at, bannedBy = :by',
      ExpressionAttributeValues: {
        ':banned': true,
        ':reason': reason || 'No reason provided',
        ':at': new Date().toISOString(),
        ':by': bannedBy,
      },
      ConditionExpression: 'attribute_exists(accountId)',
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes as Account;
}

/**
 * Unban an account
 */
export async function unbanAccount(accountId: string): Promise<Account> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: 'REMOVE isBanned, banReason, bannedAt, bannedBy',
      ConditionExpression: 'attribute_exists(accountId)',
      ReturnValues: 'ALL_NEW',
    })
  );
  return result.Attributes as Account;
}

/**
 * Get all banned accounts (full data)
 */
export async function getBannedAccounts(): Promise<Account[]> {
  const accounts: Account[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const MAX_PAGES = 20;
  let pageCount = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        FilterExpression: 'isBanned = :banned',
        ExpressionAttributeValues: { ':banned': true },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      accounts.push(...(result.Items as Account[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
    pageCount++;
  } while (lastEvaluatedKey && pageCount < MAX_PAGES);

  return accounts;
}

/**
 * Get banned account IDs only (lightweight, for public endpoint filtering)
 */
export async function getBannedAccountIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const MAX_PAGES = 20;
  let pageCount = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: ACCOUNTS_TABLE,
        FilterExpression: 'isBanned = :banned',
        ExpressionAttributeValues: { ':banned': true },
        ProjectionExpression: 'accountId',
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    for (const item of result.Items || []) {
      ids.add((item as { accountId: string }).accountId);
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
    pageCount++;
  } while (lastEvaluatedKey && pageCount < MAX_PAGES);

  return ids;
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
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    // When multiple profiles exist (e.g., wallet + Twitter linked),
    // prefer the one with a non-wallet-address display name
    let bestProfile = result.Items[0] as UserProfileRecord;
    for (const item of result.Items) {
      const profile = item as UserProfileRecord;
      if (profile.username && !profile.username.startsWith('0x')) {
        bestProfile = profile;
        break;
      }
    }

    return {
      displayName: bestProfile.username,
      profileImageUrl: bestProfile.profileImageUrl,
      isRegistered: true,
    };
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
  originalUsername?: string,
  languageData?: {
    language?: AccountLanguage;
    followerCount?: number;
  }
): Promise<Account> {
  const now = new Date().toISOString();

  const account: Account = {
    accountId: uuidv4(),
    platform,
    username: username.toLowerCase(),
    originalUsername: originalUsername || username, // Preserve original casing
    lastKnownRole: role,
    language: languageData?.language,
    followerCount: languageData?.followerCount,
    displayName: profileData?.displayName,
    profileImageUrl: profileData?.profileImageUrl,
    isRegistered: profileData?.isRegistered ?? false,
    isTelegramMember: false,
    totalPostScore: 0,
    postCount: 0,
    signalCountTotal: 0,
    uniqueActiveDays: 0,
    activeDates: [],
    // Phase 9: Per-type aggregation
    originalPostCount: 0,
    originalTotalScore: 0,
    quotePostCount: 0,
    quoteTotalScore: 0,
    replyPostCount: 0,
    replyTotalScore: 0,
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
 * Phase 9: Updates per-type aggregates (original, quote, reply)
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
  postType?: PostType; // Phase 9: For per-type aggregation
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
    postType = 'original',
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
    ':zero': 0,
  };

  // Phase 9: Per-type aggregation
  // Initialize fields if they don't exist, then increment based on postType
  switch (postType) {
    case 'original':
      updateExpression += `,
        originalPostCount = if_not_exists(originalPostCount, :zero) + :one,
        originalTotalScore = if_not_exists(originalTotalScore, :zero) + :postScore`;
      break;
    case 'quote':
      updateExpression += `,
        quotePostCount = if_not_exists(quotePostCount, :zero) + :one,
        quoteTotalScore = if_not_exists(quoteTotalScore, :zero) + :postScore`;
      break;
    case 'reply':
      updateExpression += `,
        replyPostCount = if_not_exists(replyPostCount, :zero) + :one,
        replyTotalScore = if_not_exists(replyTotalScore, :zero) + :postScore`;
      break;
  }

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
 * Update account language and follower count (for admin editing)
 * Also recalculates role based on new values
 */
export async function updateAccountLanguageData(params: {
  accountId: string;
  language: AccountLanguage;
  followerCount: number;
}): Promise<Account> {
  const { accountId, language, followerCount } = params;

  // Import getRoleByFollowers dynamically to avoid circular dependency
  const { getRoleByFollowers } = await import('./score-calculator');
  const newRole = getRoleByFollowers(followerCount, language);

  const result = await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: 'SET #lang = :lang, followerCount = :fc, lastKnownRole = :role',
      ExpressionAttributeNames: {
        '#lang': 'language', // 'language' is a reserved word in DynamoDB
      },
      ExpressionAttributeValues: {
        ':lang': language,
        ':fc': followerCount,
        ':role': newRole,
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
 * Phase 9: Updates per-type aggregates (original, quote, reply)
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
  isTelegramMember?: boolean;
  postType?: PostType; // Phase 9: For per-type aggregation
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
    isTelegramMember,
    postType = 'original',
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

    // Phase 9: Calculate per-type aggregates
    const newOriginalCount =
      (existingRecord.originalPostCount || 0) + (postType === 'original' ? 1 : 0);
    const newOriginalScore =
      (existingRecord.originalTotalScore || 0) + (postType === 'original' ? postScoreToAdd : 0);
    const newQuoteCount =
      (existingRecord.quotePostCount || 0) + (postType === 'quote' ? 1 : 0);
    const newQuoteScore =
      (existingRecord.quoteTotalScore || 0) + (postType === 'quote' ? postScoreToAdd : 0);
    const newReplyCount =
      (existingRecord.replyPostCount || 0) + (postType === 'reply' ? 1 : 0);
    const newReplyScore =
      (existingRecord.replyTotalScore || 0) + (postType === 'reply' ? postScoreToAdd : 0);

    // Recalculate scores using per-type calculation
    const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
      calculateSeasonUserScore({
        totalPostScore: newTotalPostScore,
        postCount: newPostCount,
        uniqueActiveDays: newUniqueDays,
        lastSeenAt,
        // Phase 9: Per-type fields
        originalPostCount: newOriginalCount,
        originalTotalScore: newOriginalScore,
        quotePostCount: newQuoteCount,
        quoteTotalScore: newQuoteScore,
        replyPostCount: newReplyCount,
        replyTotalScore: newReplyScore,
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
      'isTelegramMember = :isTelegramMember',
      // Phase 9: Per-type fields
      'originalPostCount = :originalPostCount',
      'originalTotalScore = :originalTotalScore',
      'quotePostCount = :quotePostCount',
      'quoteTotalScore = :quoteTotalScore',
      'replyPostCount = :replyPostCount',
      'replyTotalScore = :replyTotalScore',
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
      ':isTelegramMember': isTelegramMember ?? false,
      // Phase 9: Per-type values
      ':originalPostCount': newOriginalCount,
      ':originalTotalScore': newOriginalScore,
      ':quotePostCount': newQuoteCount,
      ':quoteTotalScore': newQuoteScore,
      ':replyPostCount': newReplyCount,
      ':replyTotalScore': newReplyScore,
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
    // Phase 9: Initialize per-type fields based on postType
    const initialOriginalCount = postType === 'original' ? 1 : 0;
    const initialOriginalScore = postType === 'original' ? postScoreToAdd : 0;
    const initialQuoteCount = postType === 'quote' ? 1 : 0;
    const initialQuoteScore = postType === 'quote' ? postScoreToAdd : 0;
    const initialReplyCount = postType === 'reply' ? 1 : 0;
    const initialReplyScore = postType === 'reply' ? postScoreToAdd : 0;

    const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
      calculateSeasonUserScore({
        totalPostScore: postScoreToAdd,
        postCount: 1,
        uniqueActiveDays: 1,
        lastSeenAt,
        // Phase 9: Per-type fields
        originalPostCount: initialOriginalCount,
        originalTotalScore: initialOriginalScore,
        quotePostCount: initialQuoteCount,
        quoteTotalScore: initialQuoteScore,
        replyPostCount: initialReplyCount,
        replyTotalScore: initialReplyScore,
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
      isTelegramMember: isTelegramMember ?? false,
      // Phase 9: Per-type aggregation
      originalPostCount: initialOriginalCount,
      originalTotalScore: initialOriginalScore,
      quotePostCount: initialQuoteCount,
      quoteTotalScore: initialQuoteScore,
      replyPostCount: initialReplyCount,
      replyTotalScore: initialReplyScore,
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
 * Delegates to centralized calculateScoreComponents() in score-calculator.ts
 */
function calculateSeasonUserScore(params: {
  totalPostScore: number;
  postCount: number;
  uniqueActiveDays: number;
  lastSeenAt: string;
  originalPostCount?: number;
  originalTotalScore?: number;
  quotePostCount?: number;
  quoteTotalScore?: number;
  replyPostCount?: number;
  replyTotalScore?: number;
  adjustmentTotalScore?: number;
}): {
  rawScore: number;
  consistencyBonus: number;
  freshnessMultiplier: number;
  userScore: number;
} {
  return calculateScoreComponents(params);
}

/**
 * Adjust the cumulative adjustmentTotalScore on an Account record
 * Uses DynamoDB ADD which treats missing attributes as 0
 */
export async function adjustAccountAdjustmentScore(
  accountId: string,
  delta: number
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: ACCOUNTS_TABLE,
      Key: { accountId },
      UpdateExpression: 'ADD adjustmentTotalScore :delta',
      ExpressionAttributeValues: {
        ':delta': Math.round(delta * 1000) / 1000,
      },
    })
  );
}

/**
 * Adjust the adjustmentTotalScore on a SeasonAccountScore record
 * and recalculate userScore for consistent ranking
 */
export async function adjustSeasonAdjustmentScore(
  seasonId: string,
  accountId: string,
  delta: number,
  accountInfo: {
    username: string;
    platform: Platform;
    originalUsername?: string;
    displayName?: string;
    profileImageUrl?: string;
    isRegistered?: boolean;
    isTelegramMember?: boolean;
  }
): Promise<void> {
  const pk = `SEASON#${seasonId}#ACCOUNT#${accountId}`;
  const sk = 'SCORE';

  // GET existing record to recalculate userScore
  const result = await docClient.send(
    new GetCommand({
      TableName: SEASON_ACCOUNTS_TABLE,
      Key: { pk, sk },
    })
  );

  // If no season record exists, create one with just the adjustment
  const record = result.Item
    ? (result.Item as SeasonAccountScore)
    : null;

  const newAdjustment = Math.round(((record?.adjustmentTotalScore || 0) + delta) * 1000) / 1000;
  const now = new Date().toISOString();

  // Recalculate with new adjustment
  const { rawScore, consistencyBonus, freshnessMultiplier, userScore } =
    calculateSeasonUserScore({
      totalPostScore: record?.totalPostScore || 0,
      postCount: record?.postCount || 0,
      uniqueActiveDays: record?.uniqueActiveDays || 0,
      lastSeenAt: record?.lastSeenAt || now,
      originalPostCount: record?.originalPostCount,
      originalTotalScore: record?.originalTotalScore,
      quotePostCount: record?.quotePostCount,
      quoteTotalScore: record?.quoteTotalScore,
      replyPostCount: record?.replyPostCount,
      replyTotalScore: record?.replyTotalScore,
      adjustmentTotalScore: newAdjustment,
    });

  if (record) {
    // Update existing record
    await docClient.send(
      new UpdateCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        Key: { pk, sk },
        UpdateExpression:
          'SET adjustmentTotalScore = :adj, userScore = :us, rawScore = :rs, consistencyBonus = :cb, freshnessMultiplier = :fm',
        ExpressionAttributeValues: {
          ':adj': newAdjustment,
          ':us': userScore,
          ':rs': rawScore,
          ':cb': consistencyBonus,
          ':fm': freshnessMultiplier,
        },
      })
    );
  } else {
    // Create new season record with adjustment data and account identity
    await docClient.send(
      new PutCommand({
        TableName: SEASON_ACCOUNTS_TABLE,
        Item: {
          pk,
          sk,
          seasonId,
          accountId,
          username: accountInfo.username,
          platform: accountInfo.platform,
          originalUsername: accountInfo.originalUsername,
          displayName: accountInfo.displayName,
          profileImageUrl: accountInfo.profileImageUrl,
          isRegistered: accountInfo.isRegistered,
          isTelegramMember: accountInfo.isTelegramMember,
          totalPostScore: 0,
          postCount: 0,
          uniqueActiveDays: 0,
          activeDates: [],
          signalCountTotal: 0,
          originalPostCount: 0,
          originalTotalScore: 0,
          quotePostCount: 0,
          quoteTotalScore: 0,
          replyPostCount: 0,
          replyTotalScore: 0,
          firstSeenAt: now,
          lastSeenAt: now,
          adjustmentTotalScore: newAdjustment,
          rawScore,
          consistencyBonus,
          freshnessMultiplier,
          userScore,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      })
    );
  }
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

/**
 * Get all posts for a season using the seasonId-createdAt-index GSI.
 * Used by generate-snapshot for stateless batch decay calculation.
 * Paginates automatically to retrieve all posts.
 */
export async function getPostsBySeasonId(seasonId: string): Promise<Post[]> {
  const posts: Post[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: POSTS_TABLE,
        IndexName: DYNAMO_KEYS.POSTS_SEASON_INDEX,
        KeyConditionExpression: 'seasonId = :seasonId',
        ExpressionAttributeValues: {
          ':seasonId': seasonId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      posts.push(...(result.Items as Post[]));
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return posts;
}
