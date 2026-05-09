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
import { getErc721Balance, getErc1155TokenIds } from "./eth-rpc";

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

const GENESIS_PASS_CONTRACT = (process.env.GENESIS_PASS_CONTRACT_ADDRESS || "").toLowerCase();

if (!GENESIS_PASS_CONTRACT) {
  throw new Error("GENESIS_PASS_CONTRACT_ADDRESS not set");
}

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

// ---- On-demand ownership fallback ----
//
// Used when the daily snapshot hasn't caught up yet (newly linked MetaMask,
// fresh OpenSea purchase, etc.). Calls ERC-721 balanceOf (26 CU) instead of
// Alchemy getNFTsForOwner (480 CU) — activate flow only needs the count.
//
// Negative results (count = 0) are also persisted so repeated activation
// attempts by non-holders do not re-hit Alchemy. The persisted row is treated
// as a 10-minute cache by handleActivate; eth-collector's cleanup further
// drops zero-balance rows older than 24h.
//
// Merges with the existing ETH#LATEST row so that a single-contract refresh
// does not clobber holdings of other tracked collections (e.g., on-demand
// activate for Battalion must not erase a Genesis Pass entry written by the
// daily snapshot).

const ON_DEMAND_FRESHNESS_MS = 10 * 60 * 1000;

interface NftHolding {
  contractAddress: string;
  chain: string;
  tokenCount: number;
}

async function fetchAndPersistOwnership(
  wallet: string,
  contractAddress: string,
  standard: "erc721" | "erc1155"
): Promise<Record<string, unknown>> {
  const addr = contractAddress.toLowerCase();
  const lowerWallet = wallet.toLowerCase();
  const tokenCount =
    standard === "erc1155"
      ? (await getErc1155TokenIds(lowerWallet, addr)).length
      : await getErc721Balance(lowerWallet, addr);

  const existing = await client.send(
    new GetCommand({
      TableName: NFT_OWNERSHIP_TABLE,
      Key: { pk: "ETH#LATEST", sk: `WALLET#${lowerWallet}` },
    })
  );
  const priorHoldings =
    (existing.Item?.holdings as NftHolding[] | undefined)?.filter(
      (h) => h.contractAddress.toLowerCase() !== addr
    ) ?? [];

  const mergedHoldings: NftHolding[] = [...priorHoldings];
  if (tokenCount > 0) {
    mergedHoldings.push({ contractAddress: addr, chain: "ethereum", tokenCount });
  }
  const totalNftCount = mergedHoldings.reduce((sum, h) => sum + h.tokenCount, 0);

  const now = new Date();
  const record = {
    pk: "ETH#LATEST",
    sk: `WALLET#${lowerWallet}`,
    walletAddress: lowerWallet,
    snapshotDate: now.toISOString().slice(0, 10),
    holdings: mergedHoldings,
    totalNftCount,
    source: "alchemy-ondemand",
    lastUpdatedAt: now.toISOString(),
  };

  await client.send(new PutCommand({ TableName: NFT_OWNERSHIP_TABLE, Item: record }));

  return record;
}

// True when an existing row is an alchemy-ondemand cache that does not list the
// requested contract and is older than the freshness window. In that case the
// activate path must re-query Alchemy so a newly purchased NFT is detected.
function isStaleOnDemandMiss(
  record: Record<string, unknown> | undefined,
  contractAddress: string
): boolean {
  if (!record || record.source !== "alchemy-ondemand") return false;
  const holdings = (record.holdings as NftHolding[] | undefined) ?? [];
  const target = contractAddress.toLowerCase();
  const hasContract = holdings.some(
    (h) => h.contractAddress.toLowerCase() === target && h.tokenCount > 0
  );
  if (hasContract) return false;
  const lastUpdatedAt = record.lastUpdatedAt as string | undefined;
  if (!lastUpdatedAt) return true;
  const age = Date.now() - new Date(lastUpdatedAt).getTime();
  return !Number.isFinite(age) || age > ON_DEMAND_FRESHNESS_MS;
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
    return await activateEthNft(identityId, profile, "genesis-pass", GENESIS_PASS_CONTRACT, "erc1155", origin);
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
  standard: "erc721" | "erc1155",
  origin?: string
): Promise<APIGatewayProxyResult> {
  const linkedAccounts = profile.linkedAccounts as Record<string, unknown> | undefined;

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

  // Refresh on snapshot miss OR when a previously-cached on-demand record
  // does not list the requested contract and is older than the freshness
  // window. This catches users who buy the NFT after a non-holder activation
  // attempt cached an empty result, without re-hitting Alchemy on every retry.
  let walletRecord: Record<string, unknown> | undefined = ownershipResult.Item;
  if (!walletRecord || isStaleOnDemandMiss(walletRecord, contractAddress)) {
    console.warn(
      `[ecosystem] LATEST ${walletRecord ? "stale" : "missing"} for wallet ${evmWallet}, falling back to Alchemy`,
    );
    try {
      walletRecord = await fetchAndPersistOwnership(evmWallet, contractAddress, standard);
    } catch (err) {
      console.error(`[ecosystem] Alchemy fallback failed for ${evmWallet}:`, err);
      return jsonResponse(503, {
        error: "SNAPSHOT_UNAVAILABLE",
        message: "Ownership data is not yet available. Please try again later.",
      }, origin);
    }
  }

  // walletRecord is guaranteed defined here: the branch above either threw
  // or assigned it from fetchAndPersistOwnership.
  const holdings = ((walletRecord!.holdings as NftHolding[] | undefined) ?? []);
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
