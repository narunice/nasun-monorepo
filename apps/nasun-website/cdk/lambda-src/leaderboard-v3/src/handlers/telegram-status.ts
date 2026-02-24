/**
 * GET /v3/leaderboard/telegram-status
 *
 * Lightweight endpoint to check Telegram verification status for the current user.
 * Reads from UserProfiles table using Cognito identityId (no twitterHandle required).
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createResponse, getRequestOrigin } from '../utils/response';

// DynamoDB
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
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

async function verifyJwt(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader) {
    console.warn('[telegram-status] No Authorization header present');
    return undefined;
  }
  if (!authHeader.startsWith('Bearer ')) {
    console.warn('[telegram-status] Authorization header does not start with Bearer');
    return undefined;
  }
  const token = authHeader.slice(7);
  if (!token || token === 'undefined' || token === 'null') {
    console.warn('[telegram-status] Token is empty or literal undefined/null');
    return undefined;
  }

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error('[telegram-status] COGNITO_IDENTITY_POOL_ID not set');
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch (error: any) {
    const code = error?.code || 'UNKNOWN';
    console.error(`[telegram-status] JWT verification failed (${code}):`, error?.message || error);
    return undefined;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const requestOrigin = getRequestOrigin(event.headers);

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, {}, requestOrigin);
  }

  if (event.httpMethod !== 'GET') {
    return createResponse(405, { error: 'Method Not Allowed' }, requestOrigin);
  }

  try {
    // 1. Cognito JWT verification
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const identityId = await verifyJwt(authHeader);
    if (!identityId) {
      return createResponse(401, {
        error: 'Unauthorized',
        message: 'Valid Cognito token required',
      }, requestOrigin);
    }

    // 2. Read UserProfile
    const result = await docClient.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId },
        ProjectionExpression: 'isTelegramMember, telegramUsername',
      })
    );

    const profile = result.Item;
    return createResponse(200, {
      isTelegramMember: profile?.isTelegramMember === true,
      telegramUsername: profile?.telegramUsername || null,
    }, requestOrigin);
  } catch (error) {
    console.error('[telegram-status] Unexpected error:', error);
    return createResponse(500, {
      error: 'Internal error',
      message: 'An unexpected error occurred.',
    }, requestOrigin);
  }
};
