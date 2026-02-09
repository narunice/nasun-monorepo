import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

// Cognito Identity ID format: region:uuid
const COGNITO_ID_REGEX = /^[a-z]{2}-[a-z]+-\d:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;
const ddbClient = new DynamoDBClient({});

/**
 * 회원 탈퇴 신청 Lambda 함수
 *
 * Security: identityId + provider ownership verification prevents unauthorized deactivation.
 * The caller must provide both identityId and the matching provider stored in the profile.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const corsHeader = {
    'Access-Control-Allow-Origin': getCorsOrigin(origin),
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeader, body: '' };
  }

  // Extract identityId from query parameters
  const identityId = event.queryStringParameters?.identityId;
  const provider = event.queryStringParameters?.provider;

  if (!identityId) {
    return {
      statusCode: 400,
      headers: corsHeader,
      body: JSON.stringify({ message: "identityId query parameter is required" }),
    };
  }

  // Validate identityId format to prevent arbitrary string injection
  if (!COGNITO_ID_REGEX.test(identityId)) {
    return {
      statusCode: 400,
      headers: corsHeader,
      body: JSON.stringify({ message: "Invalid identityId format" }),
    };
  }

  // Require provider for ownership verification
  if (!provider || !['Google', 'Twitter', 'MetaMask'].includes(provider)) {
    return {
      statusCode: 400,
      headers: corsHeader,
      body: JSON.stringify({ message: "provider query parameter is required (Google, Twitter, or MetaMask)" }),
    };
  }

  console.log(`[AccountDeactivation] Initiated for IdentityId: ${identityId}, provider: ${provider}`);

  try {
    // 7-day grace period (Unix epoch seconds)
    const deletionTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

    // Atomic ownership verification + deactivation in a single DynamoDB call.
    // ConditionExpression ensures: item exists, provider matches, and not already deactivated.
    // This eliminates the TOCTOU race condition of a separate read-then-write pattern.
    await ddbClient.send(new UpdateItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId: { S: identityId } },
      UpdateExpression: "SET #status = :deactivated, #deletionScheduledAt = :ts",
      ExpressionAttributeNames: {
        "#status": "status",
        "#deletionScheduledAt": "deletionScheduledAt",
        "#provider": "provider",
      },
      ExpressionAttributeValues: {
        ":deactivated": { S: "DEACTIVATED" },
        ":ts": { N: String(deletionTime) },
        ":expectedProvider": { S: provider },
      },
      ConditionExpression: "attribute_exists(identityId) AND #provider = :expectedProvider AND (attribute_not_exists(#status) OR #status <> :deactivated)",
      ReturnValuesOnConditionCheckFailure: "ALL_OLD",
    }));

    console.log(`[AccountDeactivation] Scheduled deletion for IdentityId: ${identityId}`);

    return {
      statusCode: 202,
      headers: corsHeader,
      body: JSON.stringify({ message: "Account deactivation request accepted." }),
    };
  } catch (error: unknown) {
    const err = error as { name?: string; Item?: Record<string, { S?: string }> };
    if (err.name === 'ConditionalCheckFailedException') {
      // Inspect the old item to determine the exact failure reason
      const oldItem = err.Item;
      if (!oldItem) {
        // Item doesn't exist at all
        return {
          statusCode: 404,
          headers: corsHeader,
          body: JSON.stringify({ message: "Account not found" }),
        };
      }
      if (oldItem.status?.S === 'DEACTIVATED') {
        return {
          statusCode: 200,
          headers: corsHeader,
          body: JSON.stringify({ message: "Account is already scheduled for deletion." }),
        };
      }
      // Provider mismatch
      console.warn(`[AccountDeactivation] Provider mismatch for ${identityId}`);
      return {
        statusCode: 403,
        headers: corsHeader,
        body: JSON.stringify({ message: "Provider mismatch. Deactivation denied." }),
      };
    }
    console.error(`[AccountDeactivation] Failed for IdentityId: ${identityId}`, error);
    return {
      statusCode: 500,
      headers: corsHeader,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};