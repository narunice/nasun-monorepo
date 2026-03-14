/**
 * Genesis Pass Allowlist Register + Withdraw + Status Lambda
 *
 * GET    /genesis-pass/register (JWT required) - Check own registration status
 * POST   /genesis-pass/register (JWT required) - Register EVM wallet (upsert)
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
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  };
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, origin?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

/**
 * Query the identityId-index GSI to find an existing registration.
 * Returns the item if found, or null.
 */
async function findRegistrationByIdentity(identityId: string) {
  const result = await client.send(
    new QueryCommand({
      TableName: ALLOWLIST_TABLE,
      IndexName: "identityId-index",
      KeyConditionExpression: "identityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
      Limit: 1,
    })
  );
  return result.Items && result.Items.length > 0 ? result.Items[0] : null;
}

// ==================== GET: Check own registration status ====================

async function handleGetStatus(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  const existing = await findRegistrationByIdentity(identityId);

  if (!existing || existing.status !== "ACTIVE") {
    return jsonResponse(200, {
      success: true,
      data: { registered: false },
    }, origin);
  }

  return jsonResponse(200, {
    success: true,
    data: {
      registered: true,
      walletAddress: existing.walletAddress,
      registeredAt: existing.registeredAt,
    },
  }, origin);
}

// ==================== DELETE: Withdraw registration ====================

async function handleWithdraw(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  console.log(`[genesis-pass-withdraw] Processing withdrawal for identity: ${identityId}`);

  // 1. Try to find registration via linked MetaMask wallet
  const profileResult = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
    })
  );

  if (!profileResult.Item) {
    console.error(`[genesis-pass-withdraw] User profile not found: ${identityId}`);
    return jsonResponse(404, { success: false, error: "PROFILE_NOT_FOUND", message: "User profile not found" }, origin);
  }

  const linkedAccounts = profileResult.Item.linkedAccounts;
  const metamaskAccount = linkedAccounts?.metamask;
  const walletAddress = metamaskAccount?.walletAddress
    || (profileResult.Item.provider === "MetaMask" ? profileResult.Item.walletAddress : undefined);

  let targetWallet: string | undefined;

  if (walletAddress) {
    // MetaMask is linked: look up by wallet PK
    const normalizedAddress = walletAddress.toLowerCase();
    const existing = await client.send(
      new GetCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: normalizedAddress },
      })
    );

    if (existing.Item && existing.Item.identityId === identityId && existing.Item.status === "ACTIVE") {
      targetWallet = normalizedAddress;
    }
  }

  // 2. Fallback: find registration via identityId GSI (MetaMask unlinked or wallet mismatch)
  if (!targetWallet) {
    const gsiResult = await findRegistrationByIdentity(identityId);

    if (!gsiResult) {
      return jsonResponse(404, { success: false, error: "NOT_FOUND", message: "No registration found for this account" }, origin);
    }

    if (gsiResult.status !== "ACTIVE") {
      return jsonResponse(409, { success: false, error: "CANNOT_WITHDRAW", message: "Registration cannot be withdrawn in its current state" }, origin);
    }

    targetWallet = gsiResult.walletAddress as string;
  }

  // 3. Delete the allowlist entry with ownership guard
  await client.send(
    new DeleteCommand({
      TableName: ALLOWLIST_TABLE,
      Key: { walletAddress: targetWallet },
      ConditionExpression: "identityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
    })
  );

  console.log(`[genesis-pass-withdraw] Withdrawn: ${targetWallet} (identity: ${identityId})`);

  return jsonResponse(200, {
    success: true,
    data: { walletAddress: targetWallet },
  }, origin);
}

// ==================== POST: Register (with upsert for wallet change) ====================

async function handleRegister(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  console.log(`[genesis-pass-register] Processing registration for identity: ${identityId}`);

  // 1. Check if this identity already registered (GSI query)
  const existingByIdentity = await findRegistrationByIdentity(identityId);

  // 2. Read user profile to get linked MetaMask address
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

  // 3. Validate and normalize EVM address
  if (!EVM_ADDRESS_REGEX.test(walletAddress)) {
    console.error(`[genesis-pass-register] Invalid EVM address format: ${walletAddress}`);
    return jsonResponse(400, { success: false, error: "INVALID_ADDRESS", message: "Invalid EVM wallet address format" }, origin);
  }

  const normalizedAddress = walletAddress.toLowerCase();

  // 4. Check if the new wallet address is already registered by someone else
  // (must happen BEFORE deleting old entry to prevent data loss on conflict)
  const existingByAddress = await client.send(
    new GetCommand({
      TableName: ALLOWLIST_TABLE,
      Key: { walletAddress: normalizedAddress },
    })
  );

  if (existingByAddress.Item && existingByAddress.Item.identityId !== identityId) {
    return jsonResponse(409, {
      success: false,
      error: "ADDRESS_ALREADY_REGISTERED",
      message: "This wallet address is already registered by another account",
    }, origin);
  }

  // 5. Handle existing registration (upsert logic)
  if (existingByIdentity) {
    const existingWallet = (existingByIdentity.walletAddress as string).toLowerCase();

    // Same wallet: already registered, no change needed
    if (existingWallet === normalizedAddress) {
      return jsonResponse(409, {
        success: false,
        error: "ALREADY_REGISTERED",
        message: "You have already registered for the Genesis Pass allowlist",
        data: { walletAddress: existingWallet, registeredAt: existingByIdentity.registeredAt },
      }, origin);
    }

    // Different wallet: upsert (delete old + create new)
    console.log(`[genesis-pass-register] Wallet change: ${existingWallet} -> ${normalizedAddress} (identity: ${identityId})`);

    // Delete old entry with ownership guard
    await client.send(
      new DeleteCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: existingWallet },
        ConditionExpression: "identityId = :id",
        ExpressionAttributeValues: { ":id": identityId },
      })
    );
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

  const isUpdate = !!existingByIdentity;
  console.log(`[genesis-pass-register] ${isUpdate ? "Updated" : "Registered"}: ${normalizedAddress} (identity: ${identityId})`);

  return jsonResponse(200, {
    success: true,
    data: { walletAddress: normalizedAddress, registeredAt: now, updated: isUpdate },
  }, origin);
}

// ==================== Main Handler ====================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  try {
    // Extract identityId from authorizer context
    const identityId = event.requestContext.authorizer?.identityId;
    if (!identityId) {
      console.error("[genesis-pass] No identityId in authorizer context");
      return jsonResponse(401, { success: false, error: "UNAUTHORIZED", message: "Authentication required" }, origin);
    }

    if (event.httpMethod === "GET") {
      return handleGetStatus(identityId, origin);
    } else if (event.httpMethod === "DELETE") {
      return handleWithdraw(identityId, origin);
    } else if (event.httpMethod === "POST") {
      return handleRegister(identityId, origin);
    }

    return jsonResponse(405, { success: false, error: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, origin);
  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, {
        success: false,
        error: "CONFLICT",
        message: "Operation conflicted with another request. Please try again.",
      }, origin);
    }

    console.error("[genesis-pass] Error:", error);
    return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", message: "Operation failed. Please try again." }, origin);
  }
}
