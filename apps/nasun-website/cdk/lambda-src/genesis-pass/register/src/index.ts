/**
 * Genesis Pass Allowlist Register + Withdraw Lambda
 *
 * POST   /genesis-pass/register (JWT required) - Register EVM wallet
 * DELETE /genesis-pass/register (JWT required) - Withdraw registration
 *
 * Security: Reads EVM wallet address from UserProfiles table (server-side),
 * not from client request body. The authorizer injects identityId into context.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ALLOWLIST_TABLE = process.env.ALLOWLIST_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
if (!ALLOWLIST_TABLE || !USER_PROFILES_TABLE) {
  throw new Error("ALLOWLIST_TABLE_NAME and USER_PROFILES_TABLE_NAME environment variables are required");
}
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
  };
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, origin?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

async function handleWithdraw(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  // 1. Find registration by identityId via GSI
  const existing = await client.send(
    new QueryCommand({
      TableName: ALLOWLIST_TABLE,
      IndexName: "identityId-index",
      KeyConditionExpression: "identityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
      Limit: 1,
    })
  );

  if (!existing.Items || existing.Items.length === 0) {
    return jsonResponse(404, { success: false, error: "NOT_FOUND", message: "No registration found for this account" }, origin);
  }

  const record = existing.Items[0];
  const walletAddress = record.walletAddress as string;

  // 2. Delete with ownership + status guard
  try {
    await client.send(
      new DeleteCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress },
        ConditionExpression: "identityId = :id AND #s = :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":id": identityId, ":active": "ACTIVE" },
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, { success: false, error: "CANNOT_WITHDRAW", message: "Registration cannot be withdrawn in its current state" }, origin);
    }
    throw err;
  }

  console.log(`[genesis-pass-withdraw] Withdrawn: ${walletAddress} (identity: ${identityId})`);

  return jsonResponse(200, {
    success: true,
    data: { walletAddress },
  }, origin);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  try {
    // 1. Extract identityId from authorizer context
    const identityId = event.requestContext.authorizer?.identityId;
    if (!identityId) {
      console.error("[genesis-pass] No identityId in authorizer context");
      return jsonResponse(401, { success: false, error: "UNAUTHORIZED", message: "Authentication required" }, origin);
    }

    // Route: DELETE = withdraw, POST = register
    if (event.httpMethod === "DELETE") {
      return handleWithdraw(identityId, origin);
    }

    console.log(`[genesis-pass-register] Processing registration for identity: ${identityId}`);

    // 2. Check if this identity already registered (GSI query)
    // Note: This check is not atomic with the PutCommand below.
    // In a race condition, one identity could theoretically register twice.
    // The PK ConditionExpression prevents duplicate wallet addresses atomically.
    // For production scale, consider TransactWriteItems for full atomicity.
    const existingByIdentity = await client.send(
      new QueryCommand({
        TableName: ALLOWLIST_TABLE,
        IndexName: "identityId-index",
        KeyConditionExpression: "identityId = :id",
        ExpressionAttributeValues: { ":id": identityId },
        Limit: 1,
      })
    );

    if (existingByIdentity.Items && existingByIdentity.Items.length > 0) {
      const existing = existingByIdentity.Items[0];
      return jsonResponse(409, {
        success: false,
        error: "ALREADY_REGISTERED",
        message: "You have already registered for the Genesis Pass allowlist",
        data: { walletAddress: existing.walletAddress, registeredAt: existing.registeredAt },
      }, origin);
    }

    // 3. Read user profile to get linked MetaMask address
    const profileResult = await client.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId },
      })
    );

    if (!profileResult.Item) {
      console.error(`[genesis-pass-register] User profile not found: ${identityId}`);
      return jsonResponse(404, { success: false, error: "PROFILE_NOT_FOUND", message: "User profile not found" }, origin);
    }

    // Extract MetaMask wallet address from linked accounts
    const linkedAccounts = profileResult.Item.linkedAccounts;
    const metamaskAccount = linkedAccounts?.metamask;
    const walletAddress = metamaskAccount?.walletAddress
      || (profileResult.Item.provider === "MetaMask" ? profileResult.Item.walletAddress : undefined);

    if (!walletAddress) {
      return jsonResponse(400, {
        success: false,
        error: "NO_EVM_WALLET",
        message: "No EVM wallet linked to your account. Please connect a MetaMask wallet first.",
      }, origin);
    }

    // 4. Validate and normalize EVM address
    if (!EVM_ADDRESS_REGEX.test(walletAddress)) {
      console.error(`[genesis-pass-register] Invalid EVM address format: ${walletAddress}`);
      return jsonResponse(400, { success: false, error: "INVALID_ADDRESS", message: "Invalid EVM wallet address format" }, origin);
    }

    const normalizedAddress = walletAddress.toLowerCase();

    // 5. Check if this wallet address is already registered by someone else
    const existingByAddress = await client.send(
      new GetCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: normalizedAddress },
      })
    );

    if (existingByAddress.Item) {
      return jsonResponse(409, {
        success: false,
        error: "ADDRESS_ALREADY_REGISTERED",
        message: "This wallet address is already registered",
      }, origin);
    }

    // 6. Register to allowlist
    const now = new Date().toISOString();
    await client.send(
      new PutCommand({
        TableName: ALLOWLIST_TABLE,
        Item: {
          walletAddress: normalizedAddress,
          identityId,
          registeredAt: now,
          status: "ACTIVE",
        },
        ConditionExpression: "attribute_not_exists(walletAddress)",
      })
    );

    console.log(`[genesis-pass-register] Registered: ${normalizedAddress} (identity: ${identityId})`);

    return jsonResponse(200, {
      success: true,
      data: { walletAddress: normalizedAddress, registeredAt: now },
    }, origin);
  } catch (error: any) {
    // ConditionalCheckFailedException = race condition on PK
    if (error.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, {
        success: false,
        error: "ADDRESS_ALREADY_REGISTERED",
        message: "This wallet address is already registered",
      }, origin);
    }

    console.error("[genesis-pass-register] Error:", error);
    return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", message: "Registration failed. Please try again." }, origin);
  }
}
