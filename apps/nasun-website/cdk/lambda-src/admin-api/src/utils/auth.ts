import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { createRemoteJWKSet, jwtVerify } from "jose";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";

export interface AdminUser {
  identityId: string;
  email?: string;
  username?: string;
  role: string;
}

/**
 * Verify if the given identityId belongs to an admin user
 */
export async function verifyAdminRole(identityId: string): Promise<AdminUser | null> {
  if (!identityId) {
    console.warn("No identityId provided");
    return null;
  }

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
    if (role !== "ADMIN") {
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
    console.error("Error verifying admin role:", error);
    return null;
  }
}

/**
 * Extract identityId from API Gateway Lambda Authorizer context.
 * Used for endpoints protected by the Token Authorizer.
 */
export function extractIdentityIdFromAuthorizer(
  requestContext: APIGatewayProxyEvent["requestContext"]
): string | undefined {
  return requestContext.authorizer?.identityId as string | undefined;
}

// JWKS for manual token verification (dual-purpose endpoints like GET /nft-collections?admin=true)
let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!jwksInstance) {
    jwksInstance = createRemoteJWKSet(
      new URL("https://cognito-identity.amazonaws.com/.well-known/jwks_uri")
    );
  }
  return jwksInstance;
}

// Cognito Identity Pool ID for audience validation
const IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID;

/**
 * Manually verify a Bearer token and extract identityId.
 * Used for dual-purpose endpoints where API Gateway authorizer is set to NONE
 * but some paths require authentication (e.g., GET /nft-collections?admin=true).
 */
export async function verifyTokenManually(
  authHeader: string | undefined
): Promise<string | undefined> {
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getJWKS(), {
      issuer: "https://cognito-identity.amazonaws.com",
      audience: IDENTITY_POOL_ID,
    });
    return payload.sub;
  } catch {
    return undefined;
  }
}

