/**
 * POST /v3/leaderboard/verify-telegram
 *
 * Verifies Telegram Login Widget auth data and checks channel membership.
 * Primary storage: UserProfiles table (identityId-based, works for all Cognito users).
 * Secondary sync: Leaderboard Accounts + SeasonAccounts (only when twitterHandle exists).
 *
 * Security:
 * - Cognito JWT required (Authorization: Bearer <token>)
 * - HMAC-SHA256 hash verification of Telegram auth data
 * - auth_date freshness check (24h + 300s grace)
 * - telegramUserId uniqueness enforcement (1 Telegram -> 1 Cognito user)
 * - Fail-closed on Telegram API errors
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DYNAMO_KEYS } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';

// DynamoDB
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Secrets Manager
const smClient = new SecretsManagerClient({});

// Table names
const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

// Config
const TELEGRAM_BOT_TOKEN_SECRET_NAME =
  process.env.TELEGRAM_BOT_TOKEN_SECRET_NAME || 'nasun-telegram-bot-token';
const TELEGRAM_CHANNEL_USERNAME =
  process.env.TELEGRAM_CHANNEL_USERNAME || '';
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID || '';

// Module-scope cache for bot token (survives across warm invocations)
let cachedBotToken: string | null = null;

// JWKS singleton
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri')
    );
  }
  return jwksInstance;
}

// ============================================
// Types
// ============================================

interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface UserProfile {
  identityId: string;
  twitterHandle?: string;
  isTelegramMember?: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
}

// Strict runtime validation — extracts only known Telegram fields
function validateTelegramAuth(raw: unknown): TelegramAuthData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id = Number(obj.id);
  const auth_date = Number(obj.auth_date);
  const hash = String(obj.hash || '');

  if (!Number.isInteger(id) || id <= 0) return null;
  if (!Number.isInteger(auth_date) || auth_date <= 0) return null;
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;

  const validated: TelegramAuthData = { id, auth_date, hash };
  if (typeof obj.first_name === 'string') validated.first_name = obj.first_name;
  if (typeof obj.last_name === 'string') validated.last_name = obj.last_name;
  if (typeof obj.username === 'string') validated.username = obj.username;
  if (typeof obj.photo_url === 'string') validated.photo_url = obj.photo_url;

  return validated;
}

// ============================================
// Helpers
// ============================================

async function getBotToken(): Promise<string> {
  if (cachedBotToken) return cachedBotToken;
  const result = await smClient.send(
    new GetSecretValueCommand({ SecretId: TELEGRAM_BOT_TOKEN_SECRET_NAME })
  );
  if (!result.SecretString) {
    throw new Error('Bot token secret is empty');
  }
  cachedBotToken = result.SecretString;
  return cachedBotToken;
}

async function verifyJwt(authHeader: string | undefined): Promise<{ sub?: string; error?: string }> {
  if (!authHeader) {
    console.warn('[verify-telegram] No Authorization header present');
    return { error: 'No Authorization header' };
  }
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[verify-telegram] Authorization header does not start with Bearer');
    return { error: 'Invalid Authorization format' };
  }
  const token = authHeader.slice(7);
  if (!token || token === 'undefined' || token === 'null') {
    console.warn('[verify-telegram] Token is empty or literal undefined/null');
    return { error: 'Empty or invalid token' };
  }

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error('[verify-telegram] COGNITO_IDENTITY_POOL_ID not set');
    return { error: 'Server configuration error' };
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return { sub: payload.sub };
  } catch (error: any) {
    const code = error?.code || 'UNKNOWN';
    console.error(`[verify-telegram] JWT verification failed (${code}):`, error?.message || error);
    if (code === 'ERR_JWT_EXPIRED') {
      return { error: 'Token expired. Please sign in again.' };
    }
    return { error: 'Invalid token' };
  }
}

function verifyTelegramHash(authData: TelegramAuthData, botToken: string): boolean {
  const secretKey = createHash('sha256').update(botToken).digest();

  // Build data-check-string: sorted key=value pairs (excluding hash)
  const dataCheckArr: string[] = [];
  for (const [key, value] of Object.entries(authData)) {
    if (key === 'hash') continue;
    if (value !== undefined && value !== null) {
      dataCheckArr.push(`${key}=${value}`);
    }
  }
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  const hmac = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const expectedHash = Buffer.from(authData.hash, 'hex');

  // Constant-time comparison to prevent timing attacks
  if (hmac.length !== expectedHash.length) return false;
  return timingSafeEqual(hmac, expectedHash);
}

function isAuthDateValid(authDate: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = 24 * 60 * 60 + 300; // 24 hours + 300s grace
  return now - authDate < maxAge;
}

async function checkChannelMembership(
  botToken: string,
  channelUsername: string,
  telegramUserId: number
): Promise<{ isMember: boolean; status: string }> {
  const url = `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=@${channelUsername}&user_id=${telegramUserId}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[verify-telegram] getChatMember failed:', response.status, errorBody);
    throw new Error(`Telegram API error: ${response.status}`);
  }

  const data = await response.json();
  const status = data.result?.status || 'unknown';
  const memberStatuses = ['member', 'administrator', 'creator'];
  return { isMember: memberStatuses.includes(status), status };
}

// ============================================
// UserProfiles helpers (v2: primary storage)
// ============================================

async function getUserProfileByIdentityId(identityId: string): Promise<UserProfile | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression: 'identityId, twitterHandle, isTelegramMember, telegramUserId, telegramUsername',
    })
  );
  return (result.Item as UserProfile) || null;
}

async function checkTelegramDuplicateInUserProfiles(
  telegramUserId: string,
  excludeIdentityId: string
): Promise<boolean> {
  // Query GSI for matching telegramUserId (O(1) vs full table scan)
  const result = await docClient.send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'telegramUserId-index',
      KeyConditionExpression: 'telegramUserId = :tgId',
      ExpressionAttributeValues: {
        ':tgId': telegramUserId,
      },
      ProjectionExpression: 'identityId',
      Limit: 10,
    })
  );

  // Check if any result belongs to a different user
  return (result.Items ?? []).some(
    (item) => item.identityId !== excludeIdentityId
  );
}

async function updateUserProfileTelegram(
  identityId: string,
  telegramUserId: string,
  telegramUsername: string | null,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      UpdateExpression: 'SET isTelegramMember = :true, telegramUserId = :tgId, telegramUsername = :tgUsername',
      ExpressionAttributeValues: {
        ':true': true,
        ':tgId': telegramUserId,
        ':tgUsername': telegramUsername,
      },
      ConditionExpression: 'attribute_exists(identityId)',
    })
  );
}

// ============================================
// Leaderboard sync helpers (v2: optional secondary)
// ============================================

async function findAccountByUsername(
  username: string
): Promise<{ accountId: string; isTelegramMember?: boolean } | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: ACCOUNTS_TABLE,
      IndexName: 'platform-username-index',
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: {
        ':platform': 'twitter',
        ':username': username.toLowerCase(),
      },
      Limit: 1,
    })
  );
  if (!result.Items?.length) return null;
  const item = result.Items[0];
  return {
    accountId: item.accountId as string,
    isTelegramMember: item.isTelegramMember as boolean | undefined,
  };
}

async function getActiveSeason(): Promise<{ seasonId: string } | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: SEASONS_TABLE,
      FilterExpression: 'sk = :sk AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':sk': 'METADATA',
        ':status': 'active',
      },
    })
  );
  if (result.Items?.length) return { seasonId: result.Items[0].seasonId as string };
  return null;
}

async function syncToLeaderboardAccount(
  twitterHandle: string,
  telegramUserIdStr: string,
  telegramUsername: string | null,
): Promise<void> {
  const account = await findAccountByUsername(twitterHandle);
  if (!account) return; // No leaderboard account yet — will be synced via get-my-rank later

  // Update Accounts table
  if (!account.isTelegramMember) {
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: ACCOUNTS_TABLE,
          Key: { accountId: account.accountId },
          UpdateExpression: 'SET isTelegramMember = :true, telegramUserId = :tgId, telegramUsername = :tgUsername',
          ConditionExpression: 'attribute_not_exists(isTelegramMember) OR isTelegramMember = :false',
          ExpressionAttributeValues: {
            ':true': true,
            ':false': false,
            ':tgId': telegramUserIdStr,
            ':tgUsername': telegramUsername,
          },
        })
      );
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
      // Already verified in Accounts — not an error
    }
  }

  // Update active season-accounts table
  const activeSeason = await getActiveSeason();
  if (activeSeason) {
    const pk = `SEASON#${activeSeason.seasonId}#ACCOUNT#${account.accountId}`;
    const sk = 'SCORE';

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk, sk },
          UpdateExpression: 'SET isTelegramMember = :true',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':true': true },
        })
      );
    } catch {
      // Season account may not exist yet if user hasn't posted in current season
    }
  }
}

// ============================================
// Handler
// ============================================

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);

  // OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, requestOrigin);
  }

  if (event.httpMethod !== 'POST') {
    return createResponse(405, { error: 'Method Not Allowed' }, requestOrigin);
  }

  try {
    // 1. Cognito JWT verification
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const jwtResult = await verifyJwt(authHeader);
    if (!jwtResult.sub) {
      return createResponse(401, {
        error: 'Unauthorized',
        message: jwtResult.error || 'Valid Cognito token required',
      }, requestOrigin);
    }
    const identityId = jwtResult.sub;

    // 2. Check UserProfile exists (any Cognito user, no Twitter required)
    const userProfile = await getUserProfileByIdentityId(identityId);
    if (!userProfile) {
      return createResponse(403, {
        error: 'Forbidden',
        message: 'Please sign up on Nasun Website first.',
      }, requestOrigin);
    }

    // 3. Check if already verified (idempotent)
    if (userProfile.isTelegramMember) {
      return createResponse(200, {
        success: true,
        alreadyVerified: true,
        telegramUsername: userProfile.telegramUsername || null,
        message: 'Telegram channel membership already verified',
      }, requestOrigin);
    }

    // 4. Parse and validate request body
    if (!event.body) {
      return createResponse(400, { error: 'Missing request body' }, requestOrigin);
    }

    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      return createResponse(400, { error: 'Invalid JSON body' }, requestOrigin);
    }

    const telegramAuth = validateTelegramAuth(parsedBody.telegramAuth);
    if (!telegramAuth) {
      return createResponse(400, {
        error: 'Invalid request',
        message: 'telegramAuth with valid id, hash (hex), and auth_date is required',
      }, requestOrigin);
    }

    // 5. Verify Telegram hash
    const botToken = await getBotToken();
    if (!verifyTelegramHash(telegramAuth, botToken)) {
      console.error('[verify-telegram] Hash verification failed for user:', telegramAuth.id,
        'fields:', Object.keys(telegramAuth).filter(k => k !== 'hash').sort().join(','));
      return createResponse(401, {
        error: 'Invalid Telegram auth',
        message: 'Telegram authentication data is invalid',
      }, requestOrigin);
    }

    // 6. Check auth_date freshness
    if (!isAuthDateValid(telegramAuth.auth_date)) {
      return createResponse(401, {
        error: 'Expired Telegram auth',
        message: 'Telegram authentication has expired. Please try again.',
      }, requestOrigin);
    }

    // 7. Check telegramUserId uniqueness (in UserProfiles table)
    const telegramUserIdStr = String(telegramAuth.id);
    const isDuplicate = await checkTelegramDuplicateInUserProfiles(telegramUserIdStr, identityId);
    if (isDuplicate) {
      return createResponse(409, {
        error: 'Telegram account already linked',
        message: 'This Telegram account is already linked to another user.',
      }, requestOrigin);
    }

    // 8. Check channel membership (fail-closed)
    if (!TELEGRAM_CHANNEL_USERNAME) {
      console.error('[verify-telegram] TELEGRAM_CHANNEL_USERNAME not configured');
      return createResponse(503, {
        error: 'Service misconfigured',
        message: 'Telegram channel verification is not configured.',
      }, requestOrigin);
    }

    let membership: { isMember: boolean; status: string };
    try {
      membership = await checkChannelMembership(botToken, TELEGRAM_CHANNEL_USERNAME, telegramAuth.id);
    } catch (error) {
      console.error('[verify-telegram] Telegram API error:', error);
      return createResponse(503, {
        error: 'Telegram API unavailable',
        message: 'Telegram API is temporarily unavailable. Please try again later.',
      }, requestOrigin);
    }

    if (!membership.isMember) {
      return createResponse(400, {
        error: 'Not a channel member',
        message: `Please join our Telegram channel (@${TELEGRAM_CHANNEL_USERNAME}) first, then try again.`,
        channelUsername: TELEGRAM_CHANNEL_USERNAME,
      }, requestOrigin);
    }

    // 9. Primary: Update UserProfiles table
    await updateUserProfileTelegram(identityId, telegramUserIdStr, telegramAuth.username || null);

    // 10. Secondary: Sync to leaderboard accounts if twitterHandle exists
    if (userProfile.twitterHandle) {
      try {
        await syncToLeaderboardAccount(
          userProfile.twitterHandle,
          telegramUserIdStr,
          telegramAuth.username || null,
        );
      } catch (err) {
        // Non-critical: UserProfiles is already updated, leaderboard sync can happen later via get-my-rank
        console.warn('[verify-telegram] Leaderboard sync failed (non-critical):', err);
      }
    }

    console.log('[verify-telegram] Success:', {
      identityId,
      telegramUserId: telegramUserIdStr,
      hasLeaderboardAccount: !!userProfile.twitterHandle,
    });

    return createResponse(200, {
      success: true,
      telegramUsername: telegramAuth.username || null,
      message: 'Telegram channel membership verified successfully',
    }, requestOrigin);
  } catch (error: unknown) {
    console.error('[verify-telegram] Unexpected error:', error);
    return createResponse(500, {
      error: 'Internal error',
      message: 'An unexpected error occurred. Please try again later.',
    }, requestOrigin);
  }
};
