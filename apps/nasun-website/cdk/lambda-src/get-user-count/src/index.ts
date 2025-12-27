import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const TABLE_NAME = process.env.USER_PROFILES_TABLE || "UserProfiles";

export const handler = async () => {
  try {
    const response = await client.send(
      new DescribeTableCommand({ TableName: TABLE_NAME })
    );

    const itemCount = response.Table?.ItemCount || 0;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
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
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: "Failed to fetch user count" }),
    };
  }
};
