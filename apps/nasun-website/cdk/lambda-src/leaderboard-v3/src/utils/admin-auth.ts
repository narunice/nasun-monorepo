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
import { verifyIdentityFromBearer } from '../../../_shared/auth/dual-jwks';

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

export interface AdminUser {
  identityId: string;
  email?: string;
  username?: string;
  role: string;
}

/**
 * Verify a Bearer token and extract identityId. Delegates to the shared dual-JWKS verifier
 * (Cognito + nasun-issuer during the AWS-exit grace window).
 */
export async function verifyToken(authHeader: string | undefined): Promise<string | undefined> {
  return verifyIdentityFromBearer(authHeader);
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
