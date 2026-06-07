import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { verifyIdentityFromBearer } from "../../../_shared/auth/dual-jwks";

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

/**
 * Manually verify a Bearer token and extract identityId.
 * Used for dual-purpose endpoints where API Gateway authorizer is set to NONE
 * but some paths require authentication (e.g., GET /nft-collections?admin=true).
 * Delegates to the shared dual-JWKS verifier (Cognito + nasun-issuer during the AWS-exit grace window).
 */
export async function verifyTokenManually(
  authHeader: string | undefined
): Promise<string | undefined> {
  return verifyIdentityFromBearer(authHeader);
}

