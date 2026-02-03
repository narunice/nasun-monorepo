// index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "CryptoBackupPrices";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());
function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
}

export const handler = async (event?: { headers?: Record<string, string> }) => {
  const origin = event?.headers?.origin || event?.headers?.Origin;
  const headers = corsHeaders(origin);
  try {
    const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));

    const prices: Record<string, { usd: number; updatedAt: string }> = {};
    for (const item of data.Items ?? []) {
      prices[item.coinId] = {
        usd: item.usd,
        updatedAt: item.updatedAt,
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(prices),
      headers,
    };
  } catch (err) {
    console.error("Error reading DynamoDB:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch backup prices" }),
      headers,
    };
  }
};
