/**
 * POST /v3/leaderboard/disconnect-telegram
 *
 * Disconnects (unlinks) a user's Telegram account.
 * Clears Telegram fields from UserProfiles (primary) and optionally from
 * leaderboard Accounts + SeasonAccounts (secondary sync).
 *
 * Security:
 * - Cognito JWT required (Authorization: Bearer <token>)
 * - Only the authenticated user can disconnect their own Telegram
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { DYNAMO_KEYS } from '../types';
import { createResponse, getRequestOrigin } from '../utils/response';

// DynamoDB
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// Table names
const ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_ACCOUNTS_TABLE || DYNAMO_KEYS.ACCOUNTS_TABLE;
const SEASON_ACCOUNTS_TABLE =
  process.env.LEADERBOARD_V3_SEASON_ACCOUNTS_TABLE || DYNAMO_KEYS.SEASON_ACCOUNTS_TABLE;
const SEASONS_TABLE =
  process.env.LEADERBOARD_V3_SEASONS_TABLE || DYNAMO_KEYS.SEASONS_TABLE;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

// Config
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID || '';

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

interface UserProfile {
  identityId: string;
  twitterHandle?: string;
  isTelegramMember?: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
}

// ============================================
// Helpers
// ============================================

async function verifyJwt(authHeader: string | undefined): Promise<{ sub?: string; error?: string }> {
  if (!authHeader) return { error: 'No Authorization header' };
  if (!authHeader.startsWith('Bearer ')) return { error: 'Invalid Authorization format' };

  const token = authHeader.slice(7);
  if (!token || token === 'undefined' || token === 'null') {
    return { error: 'Empty or invalid token' };
  }

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error('[disconnect-telegram] COGNITO_IDENTITY_POOL_ID not set');
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
    console.error(`[disconnect-telegram] JWT verification failed (${code}):`, error?.message || error);
    if (code === 'ERR_JWT_EXPIRED') {
      return { error: 'Token expired. Please sign in again.' };
    }
    return { error: 'Invalid token' };
  }
}

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

async function clearUserProfileTelegram(identityId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      UpdateExpression: 'SET isTelegramMember = :false REMOVE telegramUserId, telegramUsername',
      ExpressionAttributeValues: { ':false': false },
      ConditionExpression: 'attribute_exists(identityId)',
    })
  );
}

// ============================================
// Leaderboard sync helpers (clear Telegram from Accounts/SeasonAccounts)
// ============================================

async function findAccountByUsername(
  username: string
): Promise<{ accountId: string } | null> {
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
  return { accountId: result.Items[0].accountId as string };
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

async function clearLeaderboardTelegram(twitterHandle: string): Promise<void> {
  const account = await findAccountByUsername(twitterHandle);
  if (!account) return;

  // Clear Accounts table
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ACCOUNTS_TABLE,
        Key: { accountId: account.accountId },
        UpdateExpression: 'SET isTelegramMember = :false REMOVE telegramUserId, telegramUsername',
        ExpressionAttributeValues: { ':false': false },
      })
    );
  } catch (err) {
    console.error('[disconnect-telegram] Failed to clear Accounts:', err);
  }

  // Clear active SeasonAccounts
  const activeSeason = await getActiveSeason();
  if (activeSeason) {
    const pk = `SEASON#${activeSeason.seasonId}#ACCOUNT#${account.accountId}`;
    const sk = 'SCORE';
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: SEASON_ACCOUNTS_TABLE,
          Key: { pk, sk },
          UpdateExpression: 'SET isTelegramMember = :false',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':false': false },
        })
      );
    } catch {
      // Season account may not exist
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
      return createResponse(401, { error: jwtResult.error || 'Unauthorized' }, requestOrigin);
    }
    const identityId = jwtResult.sub;

    // 2. Get user profile
    const userProfile = await getUserProfileByIdentityId(identityId);
    if (!userProfile) {
      return createResponse(403, { error: 'User profile not found' }, requestOrigin);
    }

    // 3. Check if Telegram is connected
    if (!userProfile.isTelegramMember) {
      return createResponse(400, { error: 'Telegram is not connected' }, requestOrigin);
    }

    // 4. Clear Telegram from UserProfiles (primary)
    await clearUserProfileTelegram(identityId);

    // 5. Clear Telegram from leaderboard tables (secondary, optional)
    if (userProfile.twitterHandle) {
      await clearLeaderboardTelegram(userProfile.twitterHandle);
    }

    console.log('[disconnect-telegram] Successfully disconnected for:', identityId);
    return createResponse(200, { success: true }, requestOrigin);
  } catch (error) {
    console.error('[disconnect-telegram] Unexpected error:', error);
    return createResponse(500, { error: 'Internal server error' }, requestOrigin);
  }
};
