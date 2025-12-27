import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTwitterSecrets } from '../utils/secrets';
import { TwitterAPI } from '../utils/twitter-api';
import { SessionManager } from '../utils/session-manager';
import { generateCodeVerifier, generateCodeChallenge, generateState, generateSessionId } from '../utils/pkce';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const loginHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Twitter OAuth login request:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }

  try {
    // Get secrets from Secrets Manager
    const secrets = await getTwitterSecrets();

    if (!secrets) {
      throw new Error('Failed to retrieve Twitter secrets from Secrets Manager');
    }

    const TWITTER_CLIENT_ID = process.env.OAUTH2_CLIENT_ID;
    const TWITTER_CLIENT_SECRET = process.env.OAUTH2_CLIENT_SECRET;

    // Get other environment variables
    const { SESSIONS_TABLE_NAME, TWITTER_REDIRECT_URI } = process.env;

    if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET || !SESSIONS_TABLE_NAME) {
      throw new Error('Missing required environment variables or secrets.');
    }

    // Dynamically determine redirect URI from request origin
    const origin = event.headers?.origin || event.headers?.Origin || event.headers?.referer || event.headers?.Referer;
    let redirectUri = TWITTER_REDIRECT_URI || 'http://localhost:5174/callback';

    if (origin) {
      const baseUrl = origin.replace(/\/$/, '');
      redirectUri = `${baseUrl}/callback`;
      console.log('Using dynamic redirect URI from origin:', redirectUri);
    } else {
      console.log('No origin header found, using default redirect URI:', redirectUri);
    }

    // Initialize services
    const twitterAPI = new TwitterAPI(TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET);
    const sessionManager = new SessionManager(SESSIONS_TABLE_NAME);

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    const sessionId = generateSessionId();

    // Store session in DynamoDB
    await sessionManager.createSession({
      sessionId,
      codeVerifier,
      state,
      redirectUri,
    });

    // Generate Twitter authorization URL
    // Scope 확장: follows.read, like.read 추가 (NFT Event Like 검증용)
    const authUrl = twitterAPI.generateAuthUrl(
      redirectUri,
      codeChallenge,
      state,
      ['tweet.read', 'users.read', 'offline.access', 'follows.read', 'like.read']
    );

    console.log('Generated auth URL:', authUrl);
    console.log('Session created:', sessionId);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        authUrl,
        sessionId,
        state,
      }),
    };
  } catch (error: any) {
    console.error('Twitter login error:', error);
    
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message || 'Failed to initialize Twitter OAuth',
      }),
    };
  }
};