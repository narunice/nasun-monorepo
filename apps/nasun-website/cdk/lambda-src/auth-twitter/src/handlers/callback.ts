import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { TwitterAPI } from '../utils/twitter-api';
import { SessionManager } from '../utils/session-manager';
import { CognitoService } from '../utils/cognito';

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
  } catch (error) {
    // Log but don't fail the auth flow if leaderboard sync fails
    console.warn('Failed to sync leaderboard profile:', error);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const callbackHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Twitter OAuth callback request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { code, state, sessionId } = requestBody;

    if (!code || !state || !sessionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Missing required parameters: code, state, sessionId',
        }),
      };
    }

    // Get credentials from environment variables (not Secrets Manager)
    // This separates user auth path from operator path (x-leaderboard)
    const {
      OAUTH2_CLIENT_ID: TWITTER_CLIENT_ID,
      OAUTH2_CLIENT_SECRET: TWITTER_CLIENT_SECRET,
      SESSIONS_TABLE_NAME,
      USER_PROFILES_TABLE,
      COGNITO_IDENTITY_POOL_ID,
      COGNITO_DEVELOPER_PROVIDER_NAME,
    } = process.env;

    if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET ||
        !SESSIONS_TABLE_NAME || !USER_PROFILES_TABLE || !COGNITO_IDENTITY_POOL_ID ||
        !COGNITO_DEVELOPER_PROVIDER_NAME) {
      throw new Error('Missing required environment variables or secrets');
    }

    // Initialize services
    const twitterAPI = new TwitterAPI(TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET);
    const sessionManager = new SessionManager(SESSIONS_TABLE_NAME);
    const cognitoService = new CognitoService(COGNITO_IDENTITY_POOL_ID, COGNITO_DEVELOPER_PROVIDER_NAME);
    const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });

    // 1. Validate session and state
    const session = await sessionManager.getSession(sessionId);
    if (!session) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Invalid Session',
          message: 'Session not found or expired',
        }),
      };
    }

    if (session.state !== state) {
      return {
        statusCode: 400,
        headers: corsHeaders,
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
    
    // Normalize twitterHandle to lowercase (X handles are case-insensitive)
    const normalizedTwitterHandle = twitterUser.username.toLowerCase();
    let userProfile: any;

    if (existingProfile.Item) {
      // Update existing profile with latest Twitter info
      userProfile = {
        identityId: cognitoIdentity.identityId,
        provider: 'Twitter',
        username: twitterUser.name,
        twitterHandle: normalizedTwitterHandle,
        twitterId: twitterUser.id,
        profileImageUrl: twitterUser.profile_image_url,
        verified: twitterUser.verified,
        updatedAt: new Date().toISOString(),
      };

      // Update existing profile in DynamoDB
      await dynamoClient.send(new UpdateItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: { S: cognitoIdentity.identityId } },
        UpdateExpression: 'SET username = :username, twitterHandle = :handle, profileImageUrl = :image, verified = :verified, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':username': { S: twitterUser.name },
          ':handle': { S: normalizedTwitterHandle },
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

    // 6. Clean up session
    await sessionManager.deleteSession(sessionId);

    // 7. Return user profile to frontend
    console.log('User authenticated successfully:', userProfile);

    // NFT Event 흐름일 때는 Access Token도 함께 반환 (Like 조회용)
    const isNftEventFlow = requestBody.battalionNft === true;
    const responseBody: any = { ...userProfile };

    if (isNftEventFlow) {
      console.log('NFT Event flow detected - including xAccessToken in response');
      responseBody.xAccessToken = tokenResponse.access_token;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(responseBody),
    };

  } catch (error: any) {
    console.error('Twitter callback error:', error);

    if (error.response?.status === 401) {
      return {
        statusCode: 401,
        headers: corsHeaders,
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'Twitter authentication failed',
        }),
      };
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message || 'Failed to process Twitter OAuth callback',
      }),
    };
  }
};