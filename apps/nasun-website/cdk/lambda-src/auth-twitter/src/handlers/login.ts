import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TwitterAPI } from '../utils/twitter-api';
import { SessionManager } from '../utils/session-manager';
import { generateCodeVerifier, generateCodeChallenge, generateState, generateSessionId } from '../utils/pkce';
import { createSafeEventLog, maskSensitiveData } from '../utils/log-utils';

// Read from environment variable (set by CDK from shared constants/cors.ts)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

// SECURITY: Dynamic CORS headers based on validated origin + security headers
const getSecurityHeaders = (origin?: string) => {
  const normalizedOrigin = origin?.replace(/\/$/, '').split('/callback')[0];
  const allowedOrigin = normalizedOrigin && ALLOWED_ORIGINS.includes(normalizedOrigin)
    ? normalizedOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
};

export const loginHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Twitter OAuth login request:', createSafeEventLog(event));

  const origin = event.headers?.origin || event.headers?.Origin || event.headers?.referer || event.headers?.Referer;
  const headers = getSecurityHeaders(origin);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    // Get credentials from environment variables (not Secrets Manager)
    // This separates user auth path from operator path (data collection Lambdas)
    const TWITTER_CLIENT_ID = process.env.OAUTH2_CLIENT_ID;
    const TWITTER_CLIENT_SECRET = process.env.OAUTH2_CLIENT_SECRET;
    const { SESSIONS_TABLE_NAME, TWITTER_REDIRECT_URI } = process.env;

    if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET || !SESSIONS_TABLE_NAME) {
      throw new Error('Missing required environment variables or secrets.');
    }

    let redirectUri = TWITTER_REDIRECT_URI || 'https://nasun.io/callback';

    if (origin) {
      // Extract base URL from origin (remove trailing slash)
      const baseUrl = origin.replace(/\/$/, '').split('/callback')[0];

      // Validate origin against whitelist
      if (!ALLOWED_ORIGINS.includes(baseUrl)) {
        console.warn('SECURITY: Rejected invalid origin:', baseUrl);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid Origin',
            message: 'The request origin is not in the allowed list.',
          }),
        };
      }

      redirectUri = `${baseUrl}/callback`;
      console.log('Using validated redirect URI from origin:', redirectUri);
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
      headers,
      body: JSON.stringify({
        authUrl,
        sessionId,
        state,
      }),
    };
  } catch (error: any) {
    console.error('Twitter login error:', maskSensitiveData({ message: error.message, stack: error.stack }));

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: 'Failed to initialize Twitter OAuth',
      }),
    };
  }
};