/**
 * Genesis Pass Allowlist Check Lambda
 *
 * GET /genesis-pass/check?walletAddress=0x...
 *
 * Public endpoint (no auth required).
 * Returns whether a wallet address is registered on the allowlist.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ALLOWLIST_TABLE = process.env.ALLOWLIST_TABLE_NAME!;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, origin?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  try {
    const walletAddress = event.queryStringParameters?.walletAddress;

    if (!walletAddress) {
      return jsonResponse(400, {
        success: false,
        error: "MISSING_ADDRESS",
        message: "walletAddress query parameter is required",
      }, origin);
    }

    if (!EVM_ADDRESS_REGEX.test(walletAddress)) {
      return jsonResponse(400, {
        success: false,
        error: "INVALID_ADDRESS",
        message: "Invalid EVM wallet address format",
      }, origin);
    }

    const normalizedAddress = walletAddress.toLowerCase();

    const result = await client.send(
      new GetCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: normalizedAddress },
      })
    );

    if (result.Item && result.Item.status === "ACTIVE") {
      return jsonResponse(200, {
        success: true,
        data: {
          registered: true,
          walletAddress: normalizedAddress,
          registeredAt: result.Item.registeredAt,
        },
      }, origin);
    }

    return jsonResponse(200, {
      success: true,
      data: { registered: false },
    }, origin);
  } catch (error: any) {
    console.error("[genesis-pass-check] Error:", error);
    return jsonResponse(500, {
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to check registration status",
    }, origin);
  }
}
