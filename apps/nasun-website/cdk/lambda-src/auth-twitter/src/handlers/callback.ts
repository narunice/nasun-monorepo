import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TwitterAPI } from '../utils/twitter-api';
import { SessionManager } from '../utils/session-manager';
import { CognitoService } from '../utils/cognito';
import { createSafeEventLog, maskSensitiveData } from '../utils/log-utils';
import { getOAuthClientCredentials } from '../utils/secrets';

/**
 * Sync profile data to leaderboard-v3-accounts table
 * Updates displayName, profileImageUrl, isRegistered for accounts that match the Twitter handle
 */
async function syncLeaderboardProfile(
  dynamoClient: DynamoDBClient,
  tableName: string,
  twitterHandle: string,
  displayName: string,
  profileImageUrl?: string
): Promise<void> {
  try {
    // Query leaderboard-v3-accounts by platform-username-index
    const queryResult = await dynamoClient.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'platform-username-index',
      KeyConditionExpression: 'platform = :platform AND username = :username',
      ExpressionAttributeValues: {
        ':platform': { S: 'twitter' },
        ':username': { S: twitterHandle.toLowerCase() },
      },
      Limit: 1,
    }));

    if (queryResult.Items && queryResult.Items.length > 0) {
      const accountId = queryResult.Items[0].accountId?.S;
      if (accountId) {
        // Update profile fields
        await dynamoClient.send(new UpdateItemCommand({
          TableName: tableName,
          Key: { accountId: { S: accountId } },
          UpdateExpression: 'SET displayName = :displayName, profileImageUrl = :profileImageUrl, isRegistered = :isRegistered',
          ExpressionAttributeValues: {
            ':displayName': { S: displayName },
            ':profileImageUrl': profileImageUrl ? { S: profileImageUrl } : { NULL: true },
            ':isRegistered': { BOOL: true },
          },
        }));
        console.log(`Synced leaderboard profile for @${twitterHandle}`);
      }
    }
  } catch (error: any) {
    // Log but don't fail the auth flow if leaderboard sync fails
    console.warn('Failed to sync leaderboard profile:', maskSensitiveData({ message: error?.message }));
  }
}

// Read from environment variable (set by CDK from shared constants/cors.ts)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

// SECURITY: Dynamic CORS headers based on validated origin + security headers
const getSecurityHeaders = (origin?: string) => {
  const normalizedOrigin = origin?.replace(/\/$/, '');
  const allowedOrigin = normalizedOrigin && ALLOWED_ORIGINS.includes(normalizedOrigin)
    ? normalizedOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
};

export const callbackHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Twitter OAuth callback request:', createSafeEventLog(event));

  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = getSecurityHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { code, state: compositeState, sessionId: explicitSessionId } = requestBody;

    // Parse sessionId from composite state: "{randomState}.{sessionId}"
    // Fallback to explicit sessionId field for backward compatibility
    let resolvedSessionId = explicitSessionId;
    let originalState = compositeState;

    if (compositeState) {
      const dotIdx = compositeState.lastIndexOf('.');
      if (dotIdx > 0) {
        originalState = compositeState.substring(0, dotIdx);
        const parsedSessionId = compositeState.substring(dotIdx + 1);
        if (!resolvedSessionId && parsedSessionId) {
          resolvedSessionId = parsedSessionId;
        }
      }
    }

    if (!code || !compositeState || !resolvedSessionId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing required parameters: code, state, sessionId',
        }),
      };
    }

    // Get OAuth2 client credentials from Secrets Manager (cached across warm invocations)
    const { clientId: TWITTER_CLIENT_ID, clientSecret: TWITTER_CLIENT_SECRET } = await getOAuthClientCredentials();
    const {
      SESSIONS_TABLE_NAME,
      USER_PROFILES_TABLE,
      COGNITO_IDENTITY_POOL_ID,
      COGNITO_DEVELOPER_PROVIDER_NAME,
    } = process.env;

    if (!SESSIONS_TABLE_NAME || !USER_PROFILES_TABLE || !COGNITO_IDENTITY_POOL_ID ||
        !COGNITO_DEVELOPER_PROVIDER_NAME) {
      throw new Error('Missing required environment variables');
    }

    // Initialize services
    const twitterAPI = new TwitterAPI(TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET);
    const sessionManager = new SessionManager(SESSIONS_TABLE_NAME);
    const cognitoService = new CognitoService(COGNITO_IDENTITY_POOL_ID, COGNITO_DEVELOPER_PROVIDER_NAME);
    const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

    // 1. Atomically get and delete session (prevents replay attacks)
    const session = await sessionManager.getAndDeleteSession(resolvedSessionId);
    if (!session) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid Session',
          message: 'Session not found or expired',
        }),
      };
    }

    // Validate original state (CSRF protection) — compare against the random state stored in session,
    // not the composite state which includes the sessionId suffix
    if (session.state !== originalState) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid State',
          message: 'State parameter mismatch',
        }),
      };
    }

    // 2. Exchange authorization code for access token
    // Use session's redirectUri (set by login handler) or fallback to default
    const redirectUri = (session as any).redirectUri || 'https://nasun.io/callback';
    console.log('Using redirect URI for token exchange:', redirectUri);

    const tokenResponse = await twitterAPI.exchangeCodeForToken(
      code,
      session.codeVerifier,
      redirectUri
    );

    // 4. Get user information from Twitter
    const twitterUser = await twitterAPI.getUserInfo(tokenResponse.access_token);

    // 4. Get Cognito Identity ID
    const cognitoIdentity = await cognitoService.getCognitoIdentityId(twitterUser);

    // 5. Check if user profile exists, create if not
    const getCommand = new GetItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: {
        identityId: { S: cognitoIdentity.identityId },
      },
    });

    const existingProfile = await dynamoClient.send(getCommand);
    
    // Normalize twitterHandle to lowercase for consistent lookups
    // Keep original casing for display purposes
    const normalizedTwitterHandle = twitterUser.username.toLowerCase();
    const originalTwitterHandle = twitterUser.username; // Preserve original casing
    let userProfile: any;

    if (existingProfile.Item) {
      // Update existing profile with latest Twitter info
      userProfile = {
        identityId: cognitoIdentity.identityId,
        provider: 'Twitter',
        username: twitterUser.name,
        twitterHandle: normalizedTwitterHandle,
        originalTwitterHandle: originalTwitterHandle,
        twitterId: twitterUser.id,
        profileImageUrl: twitterUser.profile_image_url,
        verified: twitterUser.verified,
        updatedAt: new Date().toISOString(),
      };

      // Update existing profile in DynamoDB
      await dynamoClient.send(new UpdateItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: { S: cognitoIdentity.identityId } },
        UpdateExpression: 'SET username = :username, twitterHandle = :handle, originalTwitterHandle = :originalHandle, profileImageUrl = :image, verified = :verified, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':username': { S: twitterUser.name },
          ':handle': { S: normalizedTwitterHandle },
          ':originalHandle': { S: originalTwitterHandle },
          ':image': { S: twitterUser.profile_image_url || '' },
          ':verified': { BOOL: twitterUser.verified || false },
          ':updatedAt': { S: userProfile.updatedAt },
        },
      }));
    } else {
      // Create new user profile
      userProfile = {
        identityId: cognitoIdentity.identityId,
        provider: 'Twitter',
        username: twitterUser.name,
        twitterHandle: normalizedTwitterHandle,
        originalTwitterHandle: originalTwitterHandle,
        twitterId: twitterUser.id,
        profileImageUrl: twitterUser.profile_image_url,
        verified: twitterUser.verified,
        createdAt: new Date().toISOString(),
      };

      const putCommand = new PutItemCommand({
        TableName: USER_PROFILES_TABLE,
        Item: {
          identityId: { S: userProfile.identityId },
          provider: { S: userProfile.provider },
          username: { S: userProfile.username },
          twitterHandle: { S: userProfile.twitterHandle },
          originalTwitterHandle: { S: userProfile.originalTwitterHandle },
          twitterId: { S: userProfile.twitterId },
          profileImageUrl: { S: userProfile.profileImageUrl || '' },
          verified: { BOOL: userProfile.verified || false },
          createdAt: { S: userProfile.createdAt },
        },
      });

      await dynamoClient.send(putCommand);
    }

    // 5.5 Sync profile to leaderboard-v3-accounts (if table is configured)
    const LEADERBOARD_V3_ACCOUNTS_TABLE = process.env.LEADERBOARD_V3_ACCOUNTS_TABLE;
    if (LEADERBOARD_V3_ACCOUNTS_TABLE) {
      await syncLeaderboardProfile(
        dynamoClient,
        LEADERBOARD_V3_ACCOUNTS_TABLE,
        twitterUser.username,
        twitterUser.name,
        twitterUser.profile_image_url
      );
    }

    // 6. Session already deleted atomically in step 1
    // No need to delete again

    // 7. Return user profile to frontend
    console.log('User authenticated successfully:', maskSensitiveData(userProfile));

    // NFT Event flow: store X access token server-side (never expose to frontend)
    const isNftEventFlow = requestBody.battalionNft === true;
    const NFT_EVENT_TASKS_TABLE = process.env.NFT_EVENT_TASKS_TABLE_NAME;

    if (isNftEventFlow && NFT_EVENT_TASKS_TABLE && tokenResponse.access_token) {
      try {
        const docClient = DynamoDBDocumentClient.from(dynamoClient);
        const ttl = Math.floor(Date.now() / 1000) + 6900; // ~1h55m (X OAuth2 2h - 5min safety margin)
        await docClient.send(new PutCommand({
          TableName: NFT_EVENT_TASKS_TABLE,
          Item: {
            walletAddress: `__X_TOKEN_STORE__`,
            taskType: twitterUser.id,
            xAccessToken: tokenResponse.access_token,
            expiresAt: ttl,
            createdAt: new Date().toISOString(),
          },
        }));
        console.log(`X access token stored server-side for user ${twitterUser.id}`);
      } catch (tokenStoreError: any) {
        console.warn('Failed to store X access token:', maskSensitiveData({ message: tokenStoreError?.message }));
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...userProfile, cognitoToken: cognitoIdentity.token }),
    };

  } catch (error: any) {
    console.error('Twitter callback error:', maskSensitiveData({ message: error.message, stack: error.stack }));

    if (error.response?.status === 401) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Twitter authentication failed',
        }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'Failed to process Twitter OAuth callback',
      }),
    };
  }
};