/**
 * Airdrop Registration Handler
 *
 * GET  /airdrop/register - Check own registration status
 * POST /airdrop/register - Apply for airdrop
 *
 * Security: Reads walletAddress and twitterHandle from UserProfiles (server-side).
 * The authorizer injects identityId into context.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const REGISTRATIONS_TABLE = process.env.REGISTRATIONS_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
if (!REGISTRATIONS_TABLE || !USER_PROFILES_TABLE) {
  throw new Error("REGISTRATIONS_TABLE_NAME and USER_PROFILES_TABLE_NAME environment variables are required");
}
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, origin?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

// ==================== Linked identity dedup ====================

/**
 * Resolve the primary identity for dedup checks.
 * If this identity has linkedToPrimaryId, return it; otherwise return self.
 * Also returns the linked identity's registration if it exists.
 */
async function checkLinkedRegistration(
  identityId: string,
): Promise<{ linkedRegistration: Record<string, unknown> | null }> {
  // Look up this identity's profile to check linkedToPrimaryId
  const profileResult = await client.send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId } }),
  );
  const linkedToPrimaryId = profileResult.Item?.linkedToPrimaryId;

  if (!linkedToPrimaryId || linkedToPrimaryId === identityId) {
    return { linkedRegistration: null };
  }

  // Check if the linked primary identity is already registered
  const linkedReg = await client.send(
    new GetCommand({ TableName: REGISTRATIONS_TABLE, Key: { identityId: linkedToPrimaryId } }),
  );

  return { linkedRegistration: linkedReg.Item ?? null };
}

// ==================== GET: Check registration status ====================

async function handleGetStatus(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  const result = await client.send(
    new GetCommand({
      TableName: REGISTRATIONS_TABLE,
      Key: { identityId },
    })
  );

  if (result.Item) {
    return jsonResponse(200, {
      success: true,
      data: {
        status: result.Item.status,
        registeredAt: result.Item.registeredAt,
        walletAddress: result.Item.walletAddress,
        ...(result.Item.approvedAt && { approvedAt: result.Item.approvedAt }),
      },
    }, origin);
  }

  // Check if a linked identity already registered (show as registered)
  const { linkedRegistration } = await checkLinkedRegistration(identityId);
  if (linkedRegistration) {
    return jsonResponse(200, {
      success: true,
      data: {
        status: linkedRegistration.status,
        registeredAt: linkedRegistration.registeredAt,
        walletAddress: linkedRegistration.walletAddress,
        ...(linkedRegistration.approvedAt && { approvedAt: linkedRegistration.approvedAt }),
        registeredVia: "linked_account",
      },
    }, origin);
  }

  return jsonResponse(200, {
    success: true,
    data: { status: "not_applied" },
  }, origin);
}

// ==================== POST: Register for airdrop ====================

async function handleRegister(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  console.log(`[airdrop-register] Processing registration for identity: ${identityId}`);

  // 1. Check if already registered
  const existing = await client.send(
    new GetCommand({
      TableName: REGISTRATIONS_TABLE,
      Key: { identityId },
    })
  );

  if (existing.Item) {
    return jsonResponse(409, {
      success: false,
      error: "ALREADY_REGISTERED",
      message: "You have already registered for this airdrop.",
      data: { status: existing.Item.status, registeredAt: existing.Item.registeredAt },
    }, origin);
  }

  // 1.5. Check if a linked identity already registered (prevent multi-wallet abuse)
  const { linkedRegistration } = await checkLinkedRegistration(identityId);
  if (linkedRegistration) {
    console.log(`[airdrop-register] Blocked duplicate: ${identityId} (linked account already registered)`);
    return jsonResponse(409, {
      success: false,
      error: "ALREADY_REGISTERED",
      message: "You have already registered for this airdrop via a linked account.",
    }, origin);
  }

  // 2. Read user profile for wallet address and twitter handle
  const profileResult = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
    })
  );

  if (!profileResult.Item) {
    return jsonResponse(404, {
      success: false,
      error: "PROFILE_NOT_FOUND",
      message: "User profile not found.",
    }, origin);
  }

  const profile = profileResult.Item;
  const linkedAccounts = profile.linkedAccounts;

  // Resolve wallet address (Nasun wallet from zkLogin or linked wallet)
  const walletAddress = profile.walletAddress || linkedAccounts?.metamask?.walletAddress;

  // Resolve twitter handle
  const twitterHandle = profile.twitterHandle || linkedAccounts?.twitter?.twitterHandle;

  // 3. Register with conditional write (prevent race condition)
  const now = new Date().toISOString();
  try {
    await client.send(
      new PutCommand({
        TableName: REGISTRATIONS_TABLE,
        Item: {
          identityId,
          status: "pending",
          registeredAt: now,
          ...(walletAddress && { walletAddress }),
          ...(twitterHandle && { twitterHandle }),
        },
        ConditionExpression: "attribute_not_exists(identityId)",
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, {
        success: false,
        error: "ALREADY_REGISTERED",
        message: "You have already registered for this airdrop.",
      }, origin);
    }
    throw err;
  }

  console.log(`[airdrop-register] Registered: ${identityId} (wallet: ${walletAddress || "none"}, twitter: ${twitterHandle || "none"})`);

  return jsonResponse(200, {
    success: true,
    data: { status: "pending", registeredAt: now },
  }, origin);
}

// ==================== Main Handler ====================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  try {
    const identityId = event.requestContext.authorizer?.identityId;
    if (!identityId) {
      return jsonResponse(401, { success: false, error: "UNAUTHORIZED", message: "Authentication required" }, origin);
    }

    if (event.httpMethod === "GET") {
      return handleGetStatus(identityId, origin);
    } else if (event.httpMethod === "POST") {
      return handleRegister(identityId, origin);
    }

    return jsonResponse(405, { success: false, error: "METHOD_NOT_ALLOWED", message: "Method not allowed" }, origin);
  } catch (error: any) {
    console.error("[airdrop] Error:", error);
    return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", message: "Operation failed. Please try again." }, origin);
  }
}
