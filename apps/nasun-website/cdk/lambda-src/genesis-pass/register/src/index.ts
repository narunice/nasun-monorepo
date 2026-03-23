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
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const ALLOWLIST_TABLE = process.env.ALLOWLIST_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
const APPROVALS_TABLE = process.env.APPROVALS_TABLE_NAME;
if (!ALLOWLIST_TABLE || !USER_PROFILES_TABLE) {
  throw new Error("ALLOWLIST_TABLE_NAME and USER_PROFILES_TABLE_NAME environment variables are required");
}
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
// Statuses that represent an active presence on the allowlist (for conflict detection, etc.)
const ACTIVE_STATUSES = new Set(["ACTIVE", "APPLIED", "LEGACY"]);
// Statuses that allow withdrawal (soft-delete)
const WITHDRAWABLE_STATUSES = new Set(["ACTIVE", "APPLIED", "LEGACY"]);

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

/**
 * Collect all identityIds associated with a user (self + primary + all linked accounts).
 * This resolves the cross-identity issue where a user logs in with one identity
 * but their allowlist entry was registered under a different linked identity.
 */
function collectLinkedIdentityIds(identityId: string, profile?: Record<string, any>): string[] {
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
 * Find registration by trying all linked identityIds.
 * Returns the first match or null.
 */
async function findRegistrationByAnyIdentity(identityIds: string[]) {
  for (const id of identityIds) {
    const result = await findRegistrationByIdentity(id);
    if (result) return result;
  }
  return null;
}

// ==================== GET: Check own registration status ====================

async function handleGetStatus(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  // Read user profile first (needed for linked identity resolution and wallet conflict detection)
  const profileResult = await client.send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId } })
  );

  // Resolve all linked identityIds to handle cross-identity lookups
  const allIdentityIds = collectLinkedIdentityIds(identityId, profileResult.Item);
  const allIdentityIdSet = new Set(allIdentityIds);

  const existing = await findRegistrationByAnyIdentity(allIdentityIds);

  const linkedAccounts = profileResult.Item?.linkedAccounts;
  const linkedWallet = (
    linkedAccounts?.metamask?.walletAddress
    || (profileResult.Item?.provider === "MetaMask" ? profileResult.Item?.walletAddress : undefined)
  )?.toLowerCase();

  // Check if linked wallet is registered by a different user (not any of our linked identities)
  let walletConflict = false;
  if (linkedWallet) {
    const addressEntry = await client.send(
      new GetCommand({ TableName: ALLOWLIST_TABLE, Key: { walletAddress: linkedWallet } })
    );
    if (addressEntry.Item && !allIdentityIdSet.has(addressEntry.Item.identityId) && ACTIVE_STATUSES.has(addressEntry.Item.status)) {
      walletConflict = true;
    }
  }

  if (!existing || existing.status === "WITHDRAWN") {
    return jsonResponse(200, {
      success: true,
      data: { registered: false, applied: false, status: null, walletConflict },
    }, origin);
  }

  return jsonResponse(200, {
    success: true,
    data: {
      registered: existing.status === "ACTIVE",
      applied: existing.status === "APPLIED",
      status: existing.status,
      walletAddress: existing.walletAddress,
      registeredAt: existing.registeredAt,
      walletConflict,
      ...(existing.mintType && { mintType: existing.mintType }),
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

  // Resolve all linked identityIds for cross-identity lookup
  const allIdentityIds = collectLinkedIdentityIds(identityId, profileResult.Item);
  const allIdentityIdSet = new Set(allIdentityIds);

  const linkedAccounts = profileResult.Item.linkedAccounts;
  const metamaskAccount = linkedAccounts?.metamask;
  const walletAddress = metamaskAccount?.walletAddress
    || (profileResult.Item.provider === "MetaMask" ? profileResult.Item.walletAddress : undefined);

  let targetWallet: string | undefined;
  let storedIdentityId: string | undefined;

  if (walletAddress) {
    // MetaMask is linked: look up by wallet PK
    const normalizedAddress = walletAddress.toLowerCase();
    const existing = await client.send(
      new GetCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: normalizedAddress },
      })
    );

    if (existing.Item && allIdentityIdSet.has(existing.Item.identityId) && WITHDRAWABLE_STATUSES.has(existing.Item.status)) {
      targetWallet = normalizedAddress;
      storedIdentityId = existing.Item.identityId as string;
    }
  }

  // 2. Fallback: find registration via identityId GSI (MetaMask unlinked or wallet mismatch)
  if (!targetWallet) {
    const gsiResult = await findRegistrationByAnyIdentity(allIdentityIds);

    if (!gsiResult) {
      return jsonResponse(404, { success: false, error: "NOT_FOUND", message: "No registration found for this account" }, origin);
    }

    if (!WITHDRAWABLE_STATUSES.has(gsiResult.status)) {
      return jsonResponse(409, { success: false, error: "CANNOT_WITHDRAW", message: "Registration cannot be withdrawn in its current state" }, origin);
    }

    targetWallet = gsiResult.walletAddress as string;
    storedIdentityId = gsiResult.identityId as string;
  }

  // 3. Soft-delete: set status to WITHDRAWN (preserves data for audit trail)
  await client.send(
    new UpdateCommand({
      TableName: ALLOWLIST_TABLE,
      Key: { walletAddress: targetWallet },
      UpdateExpression: "SET #s = :withdrawn, withdrawnAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":withdrawn": "WITHDRAWN",
        ":now": new Date().toISOString(),
        ":id": storedIdentityId,
      },
      ConditionExpression: "identityId = :id",
    })
  );

  console.log(`[genesis-pass-withdraw] Withdrawn (soft): ${targetWallet} (identity: ${identityId})`);

  return jsonResponse(200, {
    success: true,
    data: { walletAddress: targetWallet },
  }, origin);
}

// ==================== POST: Register (with upsert for wallet change) ====================

async function handleRegister(identityId: string, origin?: string): Promise<APIGatewayProxyResult> {
  console.log(`[genesis-pass-register] Processing registration for identity: ${identityId}`);

  // 1. Read user profile to get linked MetaMask address and resolve linked identities
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

  // 2. Check if this identity (or any linked identity) already registered
  const allIdentityIds = collectLinkedIdentityIds(identityId, profileResult.Item);
  const existingByIdentity = await findRegistrationByAnyIdentity(allIdentityIds);

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

  // 4. Check if the new wallet address is already registered
  const existingByAddress = await client.send(
    new GetCommand({
      TableName: ALLOWLIST_TABLE,
      Key: { walletAddress: normalizedAddress },
    })
  );

  const allIdentityIdSet = new Set(allIdentityIds);
  const isTakeover = !!(existingByAddress.Item && !allIdentityIdSet.has(existingByAddress.Item.identityId));
  if (isTakeover) {
    // Block takeover of entries with mintType (e.g., FREE_MINT raffle winners)
    if (existingByAddress.Item!.mintType) {
      return jsonResponse(409, {
        success: false,
        error: "ADDRESS_ALREADY_REGISTERED",
        message: "This wallet address is already registered by another account and cannot be taken over.",
      }, origin);
    }
    console.log(`[genesis-pass-register] Takeover: ${normalizedAddress} from ${existingByAddress.Item!.identityId} to ${identityId}`);
  }

  // 5. Handle existing registration by this identity
  if (existingByIdentity) {
    const existingWallet = (existingByIdentity.walletAddress as string).toLowerCase();
    const existingStoredId = existingByIdentity.identityId as string;
    const existingStatus = existingByIdentity.status as string;

    // LEGACY or WITHDRAWN with same wallet: transition to APPLIED via UpdateCommand (preserves existing fields)
    if ((existingStatus === "LEGACY" || existingStatus === "WITHDRAWN") && existingWallet === normalizedAddress && !isTakeover) {
      const now = new Date().toISOString();
      await client.send(
        new UpdateCommand({
          TableName: ALLOWLIST_TABLE,
          Key: { walletAddress: existingWallet },
          UpdateExpression: "SET #s = :applied, appliedAt = :now",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: { ":applied": "APPLIED", ":now": now, ":id": existingStoredId },
          ConditionExpression: "identityId = :id",
        })
      );
      console.log(`[genesis-pass-register] Re-applied: ${existingWallet} (${existingStatus} -> APPLIED, identity: ${identityId})`);
      return jsonResponse(200, {
        success: true,
        data: { walletAddress: existingWallet, registeredAt: now, updated: true, replaced: false },
      }, origin);
    }

    // ACTIVE with same wallet: already registered, no change needed
    if (existingStatus === "ACTIVE" && existingWallet === normalizedAddress && !isTakeover) {
      return jsonResponse(409, {
        success: false,
        error: "ALREADY_REGISTERED",
        message: "You have already registered for the Genesis Pass allowlist",
        data: { walletAddress: existingWallet, registeredAt: existingByIdentity.registeredAt },
      }, origin);
    }

    // APPLIED with same wallet: already applied, no change needed
    if (existingStatus === "APPLIED" && existingWallet === normalizedAddress && !isTakeover) {
      return jsonResponse(409, {
        success: false,
        error: "ALREADY_APPLIED",
        message: "You have already applied for the Genesis Pass allowlist",
        data: { walletAddress: existingWallet, registeredAt: existingByIdentity.registeredAt },
      }, origin);
    }

    // Different wallet: delete old entry before creating new one (use stored identityId for condition)
    if (existingWallet !== normalizedAddress) {
      console.log(`[genesis-pass-register] Wallet change: ${existingWallet} -> ${normalizedAddress} (identity: ${identityId})`);
      await client.send(
        new DeleteCommand({
          TableName: ALLOWLIST_TABLE,
          Key: { walletAddress: existingWallet },
          ConditionExpression: "identityId = :id",
          ExpressionAttributeValues: { ":id": existingStoredId },
        })
      );
    }
  }

  // 6. Determine mintType/source: preserve from existing, or apply from approvals table
  let mintType = existingByIdentity?.mintType as string | undefined;
  let source = existingByIdentity?.source as string | undefined;

  if (!mintType && APPROVALS_TABLE) {
    for (const id of allIdentityIds) {
      const approval = await client.send(
        new GetCommand({ TableName: APPROVALS_TABLE, Key: { identityId: id } })
      );
      if (approval.Item) {
        mintType = approval.Item.mintType as string | undefined;
        source = approval.Item.source as string | undefined;
        console.log(`[genesis-pass-register] Auto-approval applied: mintType=${mintType}, source=${source} (via identity: ${id})`);
        break;
      }
    }
  }

  // 7. Register to allowlist (unconditional put for takeover support)
  // Pre-approved users (free mint via approvals table) get ACTIVE; everyone else gets APPLIED.
  const registrationStatus = mintType ? "ACTIVE" : "APPLIED";
  const now = new Date().toISOString();
  await client.send(
    new PutCommand({
      TableName: ALLOWLIST_TABLE,
      Item: {
        walletAddress: normalizedAddress,
        identityId,
        registeredAt: now,
        status: registrationStatus,
        ...(mintType && { mintType }),
        ...(source && { source }),
      },
    })
  );

  const isUpdate = !!existingByIdentity;
  console.log(`[genesis-pass-register] ${isTakeover ? "Takeover" : isUpdate ? "Updated" : "Registered"}: ${normalizedAddress} (identity: ${identityId})`);

  return jsonResponse(200, {
    success: true,
    data: { walletAddress: normalizedAddress, registeredAt: now, updated: isUpdate, replaced: isTakeover },
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
