/**
 * Shared admin authentication utility for Leaderboard V3 Lambda handlers.
 *
 * Verifies Cognito Identity Pool tokens (JWT) and checks admin role
 * in the UserProfiles DynamoDB table.
 *
 * Pattern replicated from admin-api/src/utils/auth.ts.
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

export interface AdminUser {
  identityId: string;
  email?: string;
  username?: string;
  role: string;
}

// JWKS singleton for token verification
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL('https://cognito-identity.amazonaws.com/.well-known/jwks_uri')
    );
  }
  return jwksInstance;
}

/**
 * Verify a Bearer token and extract identityId from Cognito JWT.
 * Returns undefined if verification fails.
 */
export async function verifyToken(authHeader: string | undefined): Promise<string | undefined> {
  if (!authHeader?.startsWith('Bearer ')) return undefined;
  const token = authHeader.slice(7);

  if (!COGNITO_IDENTITY_POOL_ID) {
    console.error('COGNITO_IDENTITY_POOL_ID is not set');
    return undefined;
  }

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: 'https://cognito-identity.amazonaws.com',
      audience: COGNITO_IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch {
    return undefined;
  }
}

/**
 * Verify if the given identityId belongs to an admin user.
 * Returns admin user info or null if not an admin.
 */
export async function verifyAdminRole(identityId: string): Promise<AdminUser | null> {
  if (!identityId) return null;

  try {
    const result = await dynamoClient.send(
      new GetItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: { S: identityId } },
      })
    );

    if (!result.Item) {
      console.warn(`User not found: ${identityId}`);
      return null;
    }

    const role = result.Item.role?.S;
    if (role !== 'ADMIN') {
      console.warn(`User ${identityId} is not an admin (role: ${role})`);
      return null;
    }

    return {
      identityId,
      email: result.Item.email?.S,
      username: result.Item.username?.S,
      role,
    };
  } catch (error) {
    console.error('Error verifying admin role:', error);
    return null;
  }
}

/**
 * Full admin authentication: verify JWT token + check admin role.
 * Returns AdminUser if authenticated, null otherwise.
 */
export async function authenticateAdmin(event: APIGatewayProxyEvent): Promise<AdminUser | null> {
  const authHeader = event.headers.Authorization || event.headers.authorization;
  const identityId = await verifyToken(authHeader);
  if (!identityId) return null;
  return verifyAdminRole(identityId);
}
