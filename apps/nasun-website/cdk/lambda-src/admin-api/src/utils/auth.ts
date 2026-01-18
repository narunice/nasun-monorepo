import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

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
 * Extract identityId from request (header or query parameter)
 */
export function extractIdentityId(
  headers: Record<string, string | undefined>,
  queryParams: Record<string, string | undefined> | null
): string | undefined {
  // Check Authorization header (format: "Bearer <identityId>")
  const authHeader = headers["Authorization"] || headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check X-Identity-Id header
  const identityHeader = headers["X-Identity-Id"] || headers["x-identity-id"];
  if (identityHeader) {
    return identityHeader;
  }

  // Check query parameter
  return queryParams?.identityId;
}
