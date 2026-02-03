import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const TABLE_NAME = process.env.USER_PROFILES_TABLE || "UserProfiles";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export const handler = async (event?: { headers?: Record<string, string> }) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;

  try {
    const response = await client.send(
      new DescribeTableCommand({ TableName: TABLE_NAME })
    );

    const itemCount = response.Table?.ItemCount || 0;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getCorsOrigin(origin),
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify({
        count: itemCount,
        tableName: TABLE_NAME,
        updatedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("Error describing DynamoDB table:", err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": getCorsOrigin(origin),
      },
      body: JSON.stringify({ error: "Failed to fetch user count" }),
    };
  }
};
