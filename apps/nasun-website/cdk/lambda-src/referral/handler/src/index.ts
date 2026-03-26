/**
 * Referral System Handler Lambda
 *
 * GET  /referral/my-code  - Get or generate referral code (lazy generation)
 * POST /referral/apply    - Apply a referral code
 * GET  /referral/my-stats - Get referral statistics and invitee list
 *
 * Security:
 * - JWT authorizer injects identityId into requestContext
 * - Self-referral blocked via collectLinkedIdentityIds()
 * - Atomic PutItem with ConditionExpression prevents duplicate referrals
 * - Referral code generation with collision retry (max 3 attempts)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const REFERRAL_CODES_TABLE = process.env.REFERRAL_CODES_TABLE_NAME;
const REFERRALS_TABLE = process.env.REFERRALS_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
const REFERRAL_STATS_API_URL = process.env.REFERRAL_STATS_API_URL || "";
const REFERRAL_STATS_API_KEY = process.env.REFERRAL_STATS_API_KEY || "";

if (!REFERRAL_CODES_TABLE || !REFERRALS_TABLE || !USER_PROFILES_TABLE) {
  throw new Error(
    "REFERRAL_CODES_TABLE_NAME, REFERRALS_TABLE_NAME, and USER_PROFILES_TABLE_NAME are required"
  );
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io")
  .split(",")
  .map((o) => o.trim());

const MAX_REFERRALS_PER_USER = 100;
const CODE_GENERATION_MAX_RETRIES = 3;

// --- Response helpers ---

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

function jsonResponse(
  statusCode: number,
  body: Record<string, unknown>,
  origin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

// --- Shared utilities ---

/**
 * Collect all identityIds associated with a user (self + primary + all linked accounts).
 * Reuses the same pattern as genesis-pass register Lambda.
 */
function collectLinkedIdentityIds(
  identityId: string,
  profile?: Record<string, any>
): string[] {
  const ids = new Set<string>([identityId]);
  if (!profile) return [...ids];

  if (profile.linkedToPrimaryId) {
    ids.add(profile.linkedToPrimaryId);
  }

  if (profile.linkedAccounts) {
    for (const account of Object.values(profile.linkedAccounts) as any[]) {
      if (account?.identityId) ids.add(account.identityId);
    }
  }

  return [...ids];
}

/**
 * Generate a cryptographic random 8-character alphanumeric code (A-Z, 0-9).
 * Uses base-36 encoding for ~41 bits of entropy (36^8 = 2.8 trillion possibilities).
 */
function generateReferralCode(): string {
  return randomBytes(5)
    .readUIntBE(0, 5)
    .toString(36)
    .toUpperCase()
    .padStart(8, "0")
    .slice(0, 8);
}

// ==================== GET /referral/my-code ====================

async function handleMyCode(
  identityId: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // 1. Check UserProfiles for existing referralCode
  const profile = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression: "referralCode",
    })
  );

  if (profile.Item?.referralCode) {
    return jsonResponse(200, { referralCode: profile.Item.referralCode }, origin);
  }

  // 2. Generate new code with collision retry
  for (let attempt = 0; attempt < CODE_GENERATION_MAX_RETRIES; attempt++) {
    const code = generateReferralCode();

    try {
      // Atomic insert into referral-codes table
      await client.send(
        new PutCommand({
          TableName: REFERRAL_CODES_TABLE,
          Item: {
            referralCode: code,
            identityId,
            createdAt: new Date().toISOString(),
          },
          ConditionExpression: "attribute_not_exists(referralCode)",
        })
      );

      // Store code in UserProfiles for quick lookup
      await client.send(
        new UpdateCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId },
          UpdateExpression: "SET referralCode = :code",
          ExpressionAttributeValues: { ":code": code },
        })
      );

      console.log(`[referral] Generated code ${code} for ${identityId}`);
      return jsonResponse(200, { referralCode: code }, origin);
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        console.warn(`[referral] Code collision on attempt ${attempt + 1}, retrying`);
        continue;
      }
      throw err;
    }
  }

  console.error(`[referral] Failed to generate unique code after ${CODE_GENERATION_MAX_RETRIES} attempts`);
  return jsonResponse(500, { error: "GENERATION_FAILED", message: "Failed to generate referral code" }, origin);
}

// ==================== POST /referral/apply ====================

async function handleApply(
  identityId: string,
  body: string | null,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // 1. Parse referral code from body
  let referralCode: string;
  try {
    const parsed = JSON.parse(body || "{}");
    referralCode = (parsed.referralCode || "").trim().toUpperCase();
  } catch {
    return jsonResponse(400, { error: "INVALID_BODY", message: "Invalid request body" }, origin);
  }

  if (!referralCode || (referralCode.length !== 6 && referralCode.length !== 8)) {
    return jsonResponse(400, { error: "INVALID_CODE", message: "Invalid referral code format" }, origin);
  }

  // 2. Look up referral code -> referrerIdentityId
  const codeResult = await client.send(
    new GetCommand({
      TableName: REFERRAL_CODES_TABLE,
      Key: { referralCode },
    })
  );

  if (!codeResult.Item) {
    return jsonResponse(404, { error: "CODE_NOT_FOUND", message: "Invalid referral code" }, origin);
  }

  const referrerIdentityId = codeResult.Item.identityId;

  // 3. Self-referral check (including linked accounts)
  const callerProfile = await client.send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId } })
  );

  const allCallerIds = collectLinkedIdentityIds(identityId, callerProfile.Item);
  if (allCallerIds.includes(referrerIdentityId)) {
    return jsonResponse(400, { error: "SELF_REFERRAL", message: "Cannot use your own referral code" }, origin);
  }

  // 4. Check referrer's existing referral count (max 100)
  const referrerCount = await client.send(
    new QueryCommand({
      TableName: REFERRALS_TABLE,
      IndexName: "referrerIdentityId-index",
      KeyConditionExpression: "referrerIdentityId = :rid",
      ExpressionAttributeValues: { ":rid": referrerIdentityId },
      Select: "COUNT",
    })
  );

  if ((referrerCount.Count || 0) >= MAX_REFERRALS_PER_USER) {
    return jsonResponse(400, {
      error: "REFERRER_LIMIT_REACHED",
      message: "This referrer has reached their maximum referral limit",
    }, origin);
  }

  // 5. Atomic insert (PK uniqueness ensures 1 referral per user)
  try {
    await client.send(
      new PutCommand({
        TableName: REFERRALS_TABLE,
        Item: {
          referredIdentityId: identityId,
          referrerIdentityId,
          referralCode,
          appliedAt: new Date().toISOString(),
          activatedAt: null,
          status: "PENDING",
        },
        ConditionExpression: "attribute_not_exists(referredIdentityId)",
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return jsonResponse(409, {
        error: "ALREADY_APPLIED",
        message: "You have already applied a referral code",
      }, origin);
    }
    throw err;
  }

  console.log(`[referral] ${identityId} applied code ${referralCode} (referrer: ${referrerIdentityId})`);
  return jsonResponse(200, { success: true }, origin);
}

// ==================== GET /referral/my-stats ====================

async function handleMyStats(
  identityId: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // 1. Get my referral code
  const profile = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
      ProjectionExpression: "referralCode",
    })
  );

  const referralCode = profile.Item?.referralCode || null;

  // 2. Get my referrals (people I invited) - no identityIds exposed
  let referrals: Array<{
    status: string;
    appliedAt: string;
    activatedAt: string | null;
  }> = [];

  if (referralCode) {
    const result = await client.send(
      new QueryCommand({
        TableName: REFERRALS_TABLE,
        IndexName: "referrerIdentityId-index",
        KeyConditionExpression: "referrerIdentityId = :id",
        ExpressionAttributeValues: { ":id": identityId },
      })
    );

    referrals = (result.Items || []).map((item) => ({
      status: item.status,
      appliedAt: item.appliedAt,
      activatedAt: item.activatedAt || null,
    }));
  }

  // 3. Check if I was referred by someone - no referrer identityId exposed
  const myReferral = await client.send(
    new GetCommand({
      TableName: REFERRALS_TABLE,
      Key: { referredIdentityId: identityId },
    })
  );

  const referredBy = myReferral.Item
    ? {
        referralCode: myReferral.Item.referralCode,
        appliedAt: myReferral.Item.appliedAt,
        status: myReferral.Item.status,
      }
    : null;

  // 4. Fetch bonus stats from api-server (if URL configured)
  let bonusStats: { totalBonusPoints: number } | null = null;
  if (REFERRAL_STATS_API_URL && referralCode) {
    try {
      const headers: Record<string, string> = {};
      if (REFERRAL_STATS_API_KEY) headers["x-api-key"] = REFERRAL_STATS_API_KEY;
      const res = await fetch(
        `${REFERRAL_STATS_API_URL}?referrer=${encodeURIComponent(identityId)}`,
        { headers, signal: AbortSignal.timeout(5_000) }
      );
      if (res.ok) {
        bonusStats = await res.json();
      }
    } catch (err) {
      console.warn("[referral] Failed to fetch bonus stats:", err);
    }
  }

  return jsonResponse(
    200,
    {
      referralCode,
      totalReferrals: referrals.length,
      activatedCount: referrals.filter((r) => r.status === "ACTIVATED").length,
      pendingCount: referrals.filter((r) => r.status === "PENDING").length,
      referrals,
      referredBy,
      bonusStats,
    },
    origin
  );
}

// ==================== Main handler ====================

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;
  const identityId = event.requestContext.authorizer?.identityId;

  if (!identityId) {
    return jsonResponse(401, { error: "UNAUTHORIZED", message: "Missing identity" }, origin);
  }

  const method = event.httpMethod;
  const path = event.resource || event.path;

  try {
    if (path.endsWith("/my-code") && method === "GET") {
      return await handleMyCode(identityId, origin);
    }

    if (path.endsWith("/apply") && method === "POST") {
      return await handleApply(identityId, event.body, origin);
    }

    if (path.endsWith("/my-stats") && method === "GET") {
      return await handleMyStats(identityId, origin);
    }

    return jsonResponse(404, { error: "NOT_FOUND", message: "Unknown endpoint" }, origin);
  } catch (err: any) {
    console.error("[referral] Handler error:", err);
    return jsonResponse(500, { error: "INTERNAL_ERROR", message: "Internal server error" }, origin);
  }
}
