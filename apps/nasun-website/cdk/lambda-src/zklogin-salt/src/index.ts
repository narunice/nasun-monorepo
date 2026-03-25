/**
 * zkLogin Salt Management Lambda
 *
 * Handles:
 * - POST /auth/zklogin/salt - Get or create salt for a user
 * - POST /auth/zklogin/verify - Verify JWT and return user info
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import * as jose from 'jose';
import { randomBytes } from 'crypto';
import { jwtToAddress } from '@mysten/sui/zklogin';

// Environment variables
const ZKLOGIN_TABLE = process.env.ZKLOGIN_TABLE_NAME || 'ZkLoginUsers';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',');

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

// CORS headers
function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json',
  };
}

// Response helpers
function success(body: object, origin?: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

function error(statusCode: number, message: string, origin?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify({ error: message }),
  };
}

// Google JWKS for JWT verification
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

// Allowed OAuth client IDs (set via environment variable)
const ALLOWED_AUD = (process.env.ALLOWED_AUD || '').split(',').filter(Boolean);

interface JwtPayload {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  name?: string;
  picture?: string;
}

interface ZkLoginUser {
  pk: string;
  sk: string;
  salt: string;
  address: string;
  provider: string;
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  createdAt: number;
  lastLoginAt: number;
}

/**
 * Verify JWT token from OAuth provider
 */
async function verifyJwt(jwt: string): Promise<JwtPayload> {
  // Decode header to get key ID
  const [headerB64] = jwt.split('.');
  const headerJson = Buffer.from(headerB64, 'base64url').toString();
  const header = JSON.parse(headerJson) as { kid: string; alg: string };

  // Fetch Google JWKS
  const jwksResponse = await fetch(GOOGLE_JWKS_URL);
  const jwks = await jwksResponse.json() as { keys: jose.JWK[] };

  // Find the matching key
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) {
    throw new Error('Invalid JWT: Key not found in JWKS');
  }

  // Create public key from JWK
  const publicKey = await jose.importJWK(key as jose.JWK, header.alg);

  // Verify JWT
  const { payload } = await jose.jwtVerify(jwt, publicKey, {
    issuer: 'https://accounts.google.com',
  });

  // Validate audience
  if (ALLOWED_AUD.length > 0 && !ALLOWED_AUD.includes(payload.aud as string)) {
    throw new Error('Invalid JWT: Audience mismatch');
  }

  return payload as unknown as JwtPayload;
}

/**
 * Generate a secure random salt
 * Returns a decimal string (BigInt compatible) for zkLogin
 */
function generateSalt(): string {
  // Generate 16 random bytes and convert to BigInt decimal string
  const hexSalt = randomBytes(16).toString('hex');
  return BigInt('0x' + hexSalt).toString();
}

/**
 * Derive Sui address from JWT and salt
 * Uses the actual zkLogin address derivation from @mysten/sui
 */
function deriveSuiAddress(jwt: string, salt: string): string {
  // jwtToAddress handles BigInt correctly, preventing ambiguity with string types
  return jwtToAddress(jwt, BigInt(salt));
}

/**
 * Handle POST /auth/zklogin/salt
 */
async function handleGetSalt(jwt: string, origin?: string): Promise<APIGatewayProxyResult> {
  try {
    // 1. Verify JWT
    const payload = await verifyJwt(jwt);
    const { sub, aud, email, name, picture, iss } = payload;

    // Determine provider from issuer
    let provider = 'unknown';
    if (iss.includes('google')) provider = 'google';
    else if (iss.includes('apple')) provider = 'apple';
    else if (iss.includes('twitch')) provider = 'twitch';

    // 2. Create partition key
    const pk = `ZKLOGIN#${provider}#${sub}`;
    const sk = 'PROFILE';

    // 3. Check if user exists
    const getResult = await docClient.send(new GetCommand({
      TableName: ZKLOGIN_TABLE,
      Key: { pk, sk },
    }));

    const now = Date.now();
    let user: ZkLoginUser;
    let isNewUser = false;

    if (getResult.Item) {
      // Existing user - update only profile fields (never overwrite salt/address)
      user = getResult.Item as ZkLoginUser;

      const updateParts: string[] = ['lastLoginAt = :now'];
      const exprValues: Record<string, any> = { ':now': now };
      const exprNames: Record<string, string> = {};

      if (email) {
        updateParts.push('email = :email');
        exprValues[':email'] = email;
      }
      if (name) {
        updateParts.push('#n = :name');
        exprValues[':name'] = name;
        exprNames['#n'] = 'name';
      }
      if (picture) {
        updateParts.push('picture = :pic');
        exprValues[':pic'] = picture;
      }

      await docClient.send(new UpdateCommand({
        TableName: ZKLOGIN_TABLE,
        Key: { pk, sk },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ...(Object.keys(exprNames).length > 0 && { ExpressionAttributeNames: exprNames }),
        ExpressionAttributeValues: exprValues,
      }));

      // Reflect updates in the user object for the response
      user.lastLoginAt = now;
      if (email) user.email = email;
      if (name) user.name = name;
      if (picture) user.picture = picture;
    } else {
      // New user - generate salt
      isNewUser = true;
      const salt = generateSalt();
      const address = deriveSuiAddress(jwt, salt);

      user = {
        pk,
        sk,
        salt,
        address,
        provider,
        sub,
        email,
        name,
        picture,
        createdAt: now,
        lastLoginAt: now,
      };

      try {
        await docClient.send(new PutCommand({
          TableName: ZKLOGIN_TABLE,
          Item: user,
          ConditionExpression: 'attribute_not_exists(pk)',
        }));
      } catch (putErr: any) {
        if (putErr.name === 'ConditionalCheckFailedException') {
          // Race condition: another request already created this user
          const retryResult = await docClient.send(new GetCommand({
            TableName: ZKLOGIN_TABLE,
            Key: { pk, sk },
            ConsistentRead: true,
          }));
          if (!retryResult.Item) {
            throw new Error('Salt record disappeared after conditional check');
          }
          user = retryResult.Item as ZkLoginUser;
          isNewUser = false;
        } else {
          throw putErr;
        }
      }
    }

    // 4. Return salt and address
    return success({
      salt: user.salt,
      address: user.address,
      isNewUser,
      provider,
      email: user.email,
      name: user.name,
      picture: user.picture,
    }, origin);

  } catch (err) {
    console.error('Error in handleGetSalt:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error(400, message, origin);
  }
}

/**
 * Main Lambda handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers.origin || event.headers.Origin;
  const path = event.path;
  const method = event.httpMethod;

  console.log(`${method} ${path}`);

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: '',
    };
  }

  // Route requests
  if (path.endsWith('/salt') && method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return error(400, 'Invalid JSON in request body', origin);
    }
    const jwt = body.jwt as string | undefined;

    if (!jwt) {
      return error(400, 'Missing jwt parameter', origin);
    }

    return handleGetSalt(jwt, origin);
  }

  return error(404, 'Not found', origin);
}
