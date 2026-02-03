import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;
const ddbClient = new DynamoDBClient({});

/**
 * 회원 탈퇴 신청 Lambda 함수
 *
 * ✅ identityId 기반 인증: 쿼리 파라미터로 identityId를 받아 DynamoDB에서 프로필 존재 여부 확인
 * ✅ 7일 유예 기간: status를 DEACTIVATED로 변경하고, deletionScheduledAt 설정
 * ✅ 로그인 시스템 무간섭: AuthContext.tsx를 전혀 수정하지 않음
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log("[AccountDeactivation] Request received:", JSON.stringify(event, null, 2));
  const origin = event.headers?.origin || event.headers?.Origin;
  const corsHeader = { 'Access-Control-Allow-Origin': getCorsOrigin(origin) };

  // 쿼리 파라미터에서 identityId 추출
  const identityId = event.queryStringParameters?.identityId;

  if (!identityId) {
    console.error("[AccountDeactivation] IdentityId not found in query parameters.");
    return {
      statusCode: 400,
      headers: corsHeader,
      body: JSON.stringify({ message: "Bad Request: identityId query parameter is required" }),
    };
  }

  console.log(`[AccountDeactivation] Initiated for IdentityId: ${identityId}`);

  // 7일 후의 타임스탬프 (Unix epoch time in seconds)
  const deletionTime = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

  try {
    const updateCmd = new UpdateItemCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId: { S: identityId } },
      UpdateExpression: "SET #status = :status, #deletionScheduledAt = :ts",
      ExpressionAttributeNames: {
        "#status": "status",
        "#deletionScheduledAt": "deletionScheduledAt",
      },
      ExpressionAttributeValues: {
        ":status": { S: "DEACTIVATED" },
        ":ts": { N: String(deletionTime) },
      },
      // Ensure the item exists before updating
      ConditionExpression: "attribute_exists(identityId)",
    });

    await ddbClient.send(updateCmd);
    console.log(`[AccountDeactivation] Successfully scheduled deletion for IdentityId: ${identityId}`);

    return {
      statusCode: 202, // Accepted
      headers: corsHeader,
      body: JSON.stringify({ message: "Account deactivation request accepted." })
    };

  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn(`[AccountDeactivation] Profile not found for IdentityId: ${identityId}. Considering as success.`);
      return {
        statusCode: 202, // Still return Accepted, as the goal is a deleted state
        headers: corsHeader,
        body: JSON.stringify({ message: "Account already deleted or does not exist." })
      };
    }
    console.error(`[AccountDeactivation] Failed for IdentityId: ${identityId}`, error);
    return {
      statusCode: 500,
      headers: corsHeader,
      body: JSON.stringify({ message: "Internal server error during account deactivation." }),
    };
  }
};