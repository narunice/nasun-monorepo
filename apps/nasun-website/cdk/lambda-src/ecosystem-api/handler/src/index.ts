/**
 * Ecosystem API Handler
 *
 * Single Lambda with route-based dispatch for NFT activation management.
 *
 * Routes:
 *   GET  /ecosystem/status     - Get activation status for all NFT types
 *   POST /ecosystem/activate   - Activate an NFT for ecosystem points
 *   POST /ecosystem/deactivate - Deactivate an NFT
 *
 * Activation verifies:
 *   - Alliance: user has minted (nasun-alliance-mint table)
 *   - GenesisPass: user's EVM wallet owns the NFT (nft-ownership ETH#LATEST snapshot)
 *   - Battalion: same pattern as GenesisPass (contract TBD)
 *
 * Sybil prevention:
 *   - Genesis Pass / Battalion require X or Telegram linked account
 *   - Duplicate social accounts across identities are blocked
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

// ---- Environment Variables ----

const ACTIVATIONS_TABLE = process.env.ACTIVATIONS_TABLE_NAME;
const ALLIANCE_MINT_TABLE = process.env.ALLIANCE_MINT_TABLE_NAME;
const NFT_OWNERSHIP_TABLE = process.env.NFT_OWNERSHIP_TABLE_NAME;
const NFT_COLLECTIONS_TABLE = process.env.NFT_COLLECTIONS_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE_NAME;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io")
  .split(",")
  .map((o) => o.trim());

if (!ACTIVATIONS_TABLE || !ALLIANCE_MINT_TABLE || !NFT_OWNERSHIP_TABLE ||
    !NFT_COLLECTIONS_TABLE || !USER_PROFILES_TABLE || !USER_WALLETS_TABLE) {
  throw new Error("Required environment variables not set");
}

// Genesis Pass contract on Ethereum Mainnet
const GENESIS_PASS_CONTRACT = "0xc40fc7cb59d85510957687cab0fa8e6adc538bf7";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// ---- Helpers ----

type NftType = "alliance" | "genesis-pass" | "battalion";
const VALID_NFT_TYPES: NftType[] = ["alliance", "genesis-pass", "battalion"];

function jsonResponse(
  statusCode: number,
  body: unknown,
  origin?: string
): APIGatewayProxyResult {
  const corsOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": corsOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event: APIGatewayProxyEvent): Record<string, unknown> {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

// ---- GET /ecosystem/status ----

async function handleStatus(
  identityId: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // Query all activations for this user
  const result = await client.send(
    new QueryCommand({
      TableName: ACTIVATIONS_TABLE,
      KeyConditionExpression: "identityId = :id",
      ExpressionAttributeValues: { ":id": identityId },
    })
  );

  const activations = (result.Items || []).map((item) => ({
    nftType: (item.sk as string).split("#")[0],
    walletAddress: (item.sk as string).split("#").slice(1).join("#"),
    status: item.status,
    activatedAt: item.activatedAt,
    lastVerifiedAt: item.lastVerifiedAt,
    nftCount: item.nftCount,
  }));

  return jsonResponse(200, { activations }, origin);
}

// ---- POST /ecosystem/activate ----

async function handleActivate(
  identityId: string,
  body: Record<string, unknown>,
  origin?: string
): Promise<APIGatewayProxyResult> {
  const nftType = body.nftType as string;
  if (!nftType || !VALID_NFT_TYPES.includes(nftType as NftType)) {
    return jsonResponse(400, {
      error: "INVALID_NFT_TYPE",
      message: `nftType must be one of: ${VALID_NFT_TYPES.join(", ")}`,
    }, origin);
  }

  // Get user profile for verification
  const profileResult = await client.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId },
    })
  );
  const profile = profileResult.Item;
  if (!profile) {
    return jsonResponse(404, {
      error: "USER_NOT_FOUND",
      message: "User profile not found",
    }, origin);
  }

  // ---- Verify NFT ownership ----

  if (nftType === "alliance") {
    return await activateAlliance(identityId, profile, origin);
  }

  if (nftType === "genesis-pass") {
    return await activateEthNft(identityId, profile, "genesis-pass", GENESIS_PASS_CONTRACT, origin);
  }

  if (nftType === "battalion") {
    // Battalion contract not yet deployed
    return jsonResponse(400, {
      error: "NOT_AVAILABLE",
      message: "Battalion NFT activation is not available yet",
    }, origin);
  }

  return jsonResponse(400, { error: "INVALID_NFT_TYPE" }, origin);
}

// Activate Alliance NFT
async function activateAlliance(
  identityId: string,
  profile: Record<string, unknown>,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // Check if user has minted Alliance NFT
  const mintResult = await client.send(
    new GetCommand({
      TableName: ALLIANCE_MINT_TABLE,
      Key: { identityId },
    })
  );

  if (!mintResult.Item) {
    return jsonResponse(400, {
      error: "NOT_OWNED",
      message: "You have not minted an Alliance NFT",
    }, origin);
  }

  const walletAddress = mintResult.Item.walletAddress as string;
  const sk = `alliance#${walletAddress}`;
  const now = new Date().toISOString();

  // Use conditional PutCommand: only write if not already ACTIVE (idempotency guard)
  try {
    await client.send(
      new PutCommand({
        TableName: ACTIVATIONS_TABLE,
        Item: {
          identityId,
          sk,
          status: "ACTIVE",
          activatedAt: now,
          lastVerifiedAt: now,
          nftCount: 1,
        },
        ConditionExpression: "attribute_not_exists(sk) OR #s <> :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":active": "ACTIVE" },
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return jsonResponse(200, {
        success: true,
        activation: { nftType: "alliance", walletAddress, status: "ACTIVE" },
        message: "Already activated",
      }, origin);
    }
    throw err;
  }

  return jsonResponse(200, {
    success: true,
    activation: { nftType: "alliance", walletAddress, status: "ACTIVE" },
  }, origin);
}

// Activate Ethereum-based NFT (Genesis Pass / Battalion)
async function activateEthNft(
  identityId: string,
  profile: Record<string, unknown>,
  nftType: string,
  contractAddress: string,
  origin?: string
): Promise<APIGatewayProxyResult> {
  // Sybil check: require X or Telegram linked
  const linkedAccounts = profile.linkedAccounts as Record<string, unknown> | undefined;
  const hasTwitter = !!(profile.twitterId || linkedAccounts?.twitter);
  const hasTelegram = !!profile.isTelegramMember;

  if (!hasTwitter && !hasTelegram) {
    return jsonResponse(400, {
      error: "SOCIAL_REQUIRED",
      message: "Link your X or Telegram account before activating",
    }, origin);
  }

  // Sybil check: ensure social account not used by another identity
  if (hasTwitter) {
    const twitterId = (profile.twitterId ||
      (linkedAccounts?.twitter as Record<string, unknown>)?.twitterId) as string;
    if (twitterId) {
      const dupCheck = await client.send(
        new QueryCommand({
          TableName: USER_PROFILES_TABLE,
          IndexName: "twitterId-index",
          KeyConditionExpression: "twitterId = :tid",
          ExpressionAttributeValues: { ":tid": twitterId },
        })
      );
      const otherUsers = (dupCheck.Items || []).filter(
        (item) => item.identityId !== identityId
      );
      if (otherUsers.length > 0) {
        return jsonResponse(400, {
          error: "SOCIAL_DUPLICATE",
          message: "This X account is already linked to another user",
        }, origin);
      }
    }
  }

  // Check Telegram independently (not exclusive with Twitter)
  if (hasTelegram) {
    const telegramUserId = profile.telegramUserId as string;
    if (telegramUserId) {
      const dupCheck = await client.send(
        new QueryCommand({
          TableName: USER_PROFILES_TABLE,
          IndexName: "telegramUserId-index",
          KeyConditionExpression: "telegramUserId = :tuid",
          ExpressionAttributeValues: { ":tuid": telegramUserId },
        })
      );
      const otherUsers = (dupCheck.Items || []).filter(
        (item) => item.identityId !== identityId
      );
      if (otherUsers.length > 0) {
        return jsonResponse(400, {
          error: "SOCIAL_DUPLICATE",
          message: "This Telegram account is already linked to another user",
        }, origin);
      }
    }
  }

  // Get EVM wallet address from linked accounts
  const evmWallet = (
    (linkedAccounts?.metamask as Record<string, unknown>)?.walletAddress as string
  )?.toLowerCase();

  if (!evmWallet) {
    return jsonResponse(400, {
      error: "NO_EVM_WALLET",
      message: "Link your MetaMask wallet before activating",
    }, origin);
  }

  // Check NFT ownership from latest snapshot
  // PK: ETH#LATEST, SK: WALLET#<address> (matches eth-collector write pattern)
  const ownershipResult = await client.send(
    new GetCommand({
      TableName: NFT_OWNERSHIP_TABLE,
      Key: {
        pk: "ETH#LATEST",
        sk: `WALLET#${evmWallet.toLowerCase()}`,
      },
    })
  );

  const walletRecord = ownershipResult.Item;
  if (!walletRecord) {
    console.warn(`[ecosystem] No LATEST snapshot for wallet ${evmWallet}`);
    return jsonResponse(503, {
      error: "SNAPSHOT_UNAVAILABLE",
      message: "Ownership data is not yet available. Please try again later.",
    }, origin);
  }

  // walletRecord.holdings is an array of { contractAddress, tokenCount, ... }
  const holdings = (walletRecord.holdings || []) as Array<{ contractAddress: string; tokenCount: number }>;
  const match = holdings.find(
    (h) => h.contractAddress.toLowerCase() === contractAddress.toLowerCase()
  );
  const nftCount = match?.tokenCount || 0;

  if (nftCount === 0) {
    return jsonResponse(400, {
      error: "NOT_OWNED",
      message: `Your wallet does not hold a ${nftType === "genesis-pass" ? "Genesis Pass" : "Battalion"} NFT`,
    }, origin);
  }

  const sk = `${nftType}#${evmWallet}`;
  const now = new Date().toISOString();

  try {
    await client.send(
      new PutCommand({
        TableName: ACTIVATIONS_TABLE,
        Item: {
          identityId,
          sk,
          status: "ACTIVE",
          activatedAt: now,
          lastVerifiedAt: now,
          nftCount,
        },
        ConditionExpression: "attribute_not_exists(sk) OR #s <> :active",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":active": "ACTIVE" },
      })
    );
  } catch (err: any) {
    if (err.name === "ConditionalCheckFailedException") {
      return jsonResponse(200, {
        success: true,
        activation: { nftType, walletAddress: evmWallet, status: "ACTIVE", nftCount },
        message: "Already activated",
      }, origin);
    }
    throw err;
  }

  return jsonResponse(200, {
    success: true,
    activation: { nftType, walletAddress: evmWallet, status: "ACTIVE", nftCount },
  }, origin);
}

// ---- POST /ecosystem/deactivate ----

async function handleDeactivate(
  identityId: string,
  body: Record<string, unknown>,
  origin?: string
): Promise<APIGatewayProxyResult> {
  const nftType = body.nftType as string;
  if (!nftType || !VALID_NFT_TYPES.includes(nftType as NftType)) {
    return jsonResponse(400, {
      error: "INVALID_NFT_TYPE",
      message: `nftType must be one of: ${VALID_NFT_TYPES.join(", ")}`,
    }, origin);
  }

  // Find existing activation for this NFT type
  const result = await client.send(
    new QueryCommand({
      TableName: ACTIVATIONS_TABLE,
      KeyConditionExpression: "identityId = :id AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":id": identityId,
        ":prefix": `${nftType}#`,
      },
    })
  );

  const existing = result.Items?.[0];
  if (!existing) {
    return jsonResponse(404, {
      error: "NOT_FOUND",
      message: "No active activation found for this NFT type",
    }, origin);
  }

  await client.send(
    new UpdateCommand({
      TableName: ACTIVATIONS_TABLE,
      Key: { identityId, sk: existing.sk },
      UpdateExpression: "SET #s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": "INACTIVE" },
    })
  );

  return jsonResponse(200, {
    success: true,
    activation: {
      nftType,
      walletAddress: (existing.sk as string).split("#").slice(1).join("#"),
      status: "INACTIVE",
    },
  }, origin);
}

// ---- Main Handler ----

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;
  const identityId = event.requestContext.authorizer?.identityId as string;

  if (!identityId) {
    return jsonResponse(401, { error: "Unauthorized" }, origin);
  }

  const method = event.httpMethod;
  const path = event.resource || event.path;

  try {
    if (path.endsWith("/status") && method === "GET") {
      return await handleStatus(identityId, origin);
    }
    if (path.endsWith("/activate") && method === "POST") {
      return await handleActivate(identityId, parseBody(event), origin);
    }
    if (path.endsWith("/deactivate") && method === "POST") {
      return await handleDeactivate(identityId, parseBody(event), origin);
    }

    return jsonResponse(404, { error: "NOT_FOUND", message: "Unknown endpoint" }, origin);
  } catch (err: unknown) {
    console.error("[ecosystem] Handler error:", err);
    return jsonResponse(500, { error: "INTERNAL_ERROR", message: "Internal server error" }, origin);
  }
}
