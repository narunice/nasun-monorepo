import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { TwitterAPI } from '../utils/twitter-api';
import { SessionManager } from '../utils/session-manager';
import { CognitoService } from '../utils/cognito';
import { createSafeEventLog, maskSensitiveData } from '../utils/log-utils';
import { getOAuthClientCredentials } from '../utils/secrets';
import { appendXHistory, XChangeType } from '../utils/xHistory';
import { grantIfReferralActivated } from '../utils/onboardingBonus';

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
        UpdateExpression: 'SET username = :username, twitterHandle = :handle, originalTwitterHandle = :originalHandle, twitterId = :twitterId, profileImageUrl = :image, verified = :verified, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':username': { S: twitterUser.name },
          ':handle': { S: normalizedTwitterHandle },
          ':originalHandle': { S: originalTwitterHandle },
          ':twitterId': { S: twitterUser.id },
          ':image': { S: twitterUser.profile_image_url || '' },
          ':verified': { BOOL: twitterUser.verified || false },
          ':updatedAt': { S: userProfile.updatedAt },
        },
      }));

      // Record X handle change history (non-blocking, best-effort).
      // account_switch is not detectable here: Cognito issues a new identityId
      // per twitterId, so this path always has a matching twitterId.
      // account_switch is handled in link-account instead.
      const oldHandle    = existingProfile.Item.twitterHandle?.S;
      const oldTwitterId = existingProfile.Item.twitterId?.S;
      let xChangeType: XChangeType | null = null;
      if (!oldHandle) {
        xChangeType = 'initial_link';
      } else if (oldHandle !== normalizedTwitterHandle) {
        xChangeType = 'handle_rename';
      }
      if (xChangeType) {
        appendXHistory(dynamoClient, USER_PROFILES_TABLE, cognitoIdentity.identityId, {
          changeType: xChangeType,
          oldHandle:    oldHandle || undefined,
          newHandle:    normalizedTwitterHandle,
          oldTwitterId: oldTwitterId || undefined,
          newTwitterId: twitterUser.id,
        }).catch((e) => console.warn('[xHistory] append failed', e));
      }

      // Onboarding bonus: x-link. Fires on every X re-login but PG UNIQUE
      // dedupes so the first call per twitterId wins. Only granted for
      // referral ACTIVATED users.
      if (process.env.EXPLORER_API_URL) {
        const docClient = DynamoDBDocumentClient.from(dynamoClient);
        await grantIfReferralActivated({
          ddbClient: docClient,
          referralsTable: process.env.REFERRALS_TABLE || 'nasun-referrals',
          explorerApiUrl: process.env.EXPLORER_API_URL,
          apiKey: process.env.ONBOARDING_BONUS_API_KEY || '',
          identityId: cognitoIdentity.identityId,
          kind: 'x-link',
          externalId: twitterUser.id,
        }).catch((e) => console.warn('[onboarding-bonus] x-link non-fatal', e));
      }
    } else {
      // Do NOT create a new user profile here.
      // Profile creation is handled by the frontend's ensureUserProfile()
      // during account linking flow. This prevents orphan Twitter-only
      // accounts from being created via direct API access.
      userProfile = {
        identityId: cognitoIdentity.identityId,
        provider: 'Twitter',
        username: twitterUser.name,
        twitterHandle: normalizedTwitterHandle,
        originalTwitterHandle: originalTwitterHandle,
        twitterId: twitterUser.id,
        profileImageUrl: twitterUser.profile_image_url,
        verified: twitterUser.verified,
      };
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