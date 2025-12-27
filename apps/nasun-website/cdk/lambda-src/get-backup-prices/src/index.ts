// index.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "ap-northeast-2" });
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "CryptoBackupPrices";

// CORS 헤더를 포함한 응답 헬퍼
const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};

export const handler = async () => {
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
      headers: corsHeaders,
    };
  } catch (err) {
    console.error("Error reading DynamoDB:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch backup prices" }),
      headers: corsHeaders,
    };
  }
};
