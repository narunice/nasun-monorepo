/**
 * Genesis Pass Allowlist Check Lambda
 *
 * GET /genesis-pass/check?walletAddress=0x...
 *
 * Public endpoint (no auth required).
 * Returns whether a wallet is registered, its mint stage, and
 * whether it is eligible for the current active stage.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

const ALLOWLIST_TABLE = process.env.ALLOWLIST_TABLE_NAME;
const STAGE_PARAM_NAME = process.env.STAGE_PARAM_NAME;
const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE_NAME || "UserWallets";
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME || "UserProfiles";
const NFT_OWNERSHIP_TABLE = process.env.NFT_OWNERSHIP_TABLE_NAME || "nasun-nft-ownership";
const GP_CONTRACT_ADDRESS = (process.env.GP_CONTRACT_ADDRESS || "0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1").toLowerCase();
if (!ALLOWLIST_TABLE || !STAGE_PARAM_NAME) {
  throw new Error("Missing required environment variables");
}
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

// Stage cache (15s TTL)
let cachedStage: { value: number; fetchedAt: number } | null = null;
const STAGE_CACHE_TTL_MS = 60_000;

const MINT_CONFIG: Record<string, number> = {
  FREE_MINT: 1,
  GUARANTEED: 2,
};
const FCFS_STAGE = 3;

function getEligibleStage(mintType: string | undefined | null): number {
  if (mintType == null) return FCFS_STAGE;
  return MINT_CONFIG[mintType] ?? FCFS_STAGE;
}

async function getCurrentStage(): Promise<number> {
  const now = Date.now();
  if (cachedStage && now - cachedStage.fetchedAt < STAGE_CACHE_TTL_MS) {
    return cachedStage.value;
  }
  const result = await ssmClient.send(new GetParameterCommand({ Name: STAGE_PARAM_NAME }));
  const value = parseInt(result.Parameter?.Value || "0", 10);
  cachedStage = { value, fetchedAt: now };
  return value;
}

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

const STAGE_LABELS: Record<number, string> = {
  0: "Paused",
  1: "Free Mint",
  2: "GTD Allowlist",
  3: "FCFS Allowlist",
  4: "Public",
};

/**
 * 3-hop DynamoDB lookup: Nasun address -> EVM address -> NFT ownership check.
 * Hop 1: UserWallets -> ownerIdentityId
 * Hop 2: UserProfiles -> EVM address (with linkedToPrimaryId fallback)
 * Hop 3: nasun-nft-ownership ETH#LATEST -> GP contract holding check
 * Pattern from governance-api resolveUserProfile().
 */
async function resolveGenesisPassByNasunAddress(nasunAddress: string): Promise<{ hasGenesisPass: boolean }> {
  const NO_GP = { hasGenesisPass: false };

  // Hop 1: UserWallets WALLET_OWNER sentinel -> identityId
  const walletResult = await ddbClient.send(
    new GetCommand({
      TableName: USER_WALLETS_TABLE,
      Key: { identityId: "WALLET_OWNER", walletAddress: nasunAddress },
    })
  );
  const ownerIdentityId = walletResult.Item?.ownerIdentityId as string | undefined;
  if (!ownerIdentityId) return NO_GP;

  // Hop 2: UserProfiles -> linkedAccounts.metamask.walletAddress
  const profileResult = await ddbClient.send(
    new GetCommand({
      TableName: USER_PROFILES_TABLE,
      Key: { identityId: ownerIdentityId },
    })
  );
  if (!profileResult.Item) return NO_GP;

  let profile = profileResult.Item;

  // Resolve to primary identity if this is a secondary (linked) account
  const linkedToPrimaryId = profile.linkedToPrimaryId as string | undefined;
  if (linkedToPrimaryId && linkedToPrimaryId !== ownerIdentityId) {
    const primaryResult = await ddbClient.send(
      new GetCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: linkedToPrimaryId },
      })
    );
    if (primaryResult.Item) {
      profile = primaryResult.Item;
    }
  }

  const linkedAccounts = profile.linkedAccounts as Record<string, any> | undefined;
  const evmAddress = (
    linkedAccounts?.metamask?.walletAddress
    || (profile.provider === "MetaMask" ? profile.walletAddress : undefined)
  )?.toLowerCase() as string | undefined;

  if (!evmAddress || !EVM_ADDRESS_REGEX.test(evmAddress)) return NO_GP;

  // Hop 3: Check actual NFT ownership from daily snapshot (nasun-nft-ownership)
  const ownershipResult = await ddbClient.send(
    new GetCommand({
      TableName: NFT_OWNERSHIP_TABLE,
      Key: { pk: "ETH#LATEST", sk: `WALLET#${evmAddress}` },
    })
  );

  if (!ownershipResult.Item) return NO_GP;

  // Check if holdings include the Genesis Pass contract
  const holdings = ownershipResult.Item.holdings as Array<{ contractAddress: string; tokenCount: number }> | undefined;
  if (!holdings) return NO_GP;

  const gpHolding = holdings.find(
    (h) => h.contractAddress.toLowerCase() === GP_CONTRACT_ADDRESS && h.tokenCount > 0,
  );

  return { hasGenesisPass: !!gpHolding };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  try {
    const walletAddress = event.queryStringParameters?.walletAddress;
    const nasunAddress = event.queryStringParameters?.nasunAddress;

    // Nasun address lookup: resolve to EVM address via 3-hop DynamoDB lookup
    if (nasunAddress) {
      if (!SUI_ADDRESS_REGEX.test(nasunAddress)) {
        return jsonResponse(400, {
          success: false,
          error: "INVALID_ADDRESS",
          message: "Invalid Nasun address format (expected 0x + 64 hex chars)",
        }, origin);
      }
      const gpStatus = await resolveGenesisPassByNasunAddress(nasunAddress.toLowerCase());
      return jsonResponse(200, { success: true, data: gpStatus }, origin);
    }

    if (!walletAddress) {
      return jsonResponse(400, {
        success: false,
        error: "MISSING_ADDRESS",
        message: "walletAddress or nasunAddress query parameter is required",
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
    const currentStage = await getCurrentStage();

    const result = await ddbClient.send(
      new GetCommand({
        TableName: ALLOWLIST_TABLE,
        Key: { walletAddress: normalizedAddress },
      })
    );

    if (!result.Item) {
      return jsonResponse(200, {
        success: true,
        data: {
          registered: false,
          applied: false,
          currentStage,
          currentStageLabel: STAGE_LABELS[currentStage] || "Unknown",
          eligible: currentStage === 4, // Public stage: anyone eligible
        },
      }, origin);
    }

    const { status, mintType } = result.Item;
    const isActive = status === "ACTIVE";
    const eligibleStage = getEligibleStage(mintType);
    const eligible = isActive && (currentStage === eligibleStage || currentStage === 4);

    return jsonResponse(200, {
      success: true,
      data: {
        registered: isActive,
        applied: status === "APPLIED",
        walletAddress: normalizedAddress,
        mintType: mintType || null,
        eligibleStage,
        eligibleStageLabel: STAGE_LABELS[eligibleStage] || "Unknown",
        currentStage,
        currentStageLabel: STAGE_LABELS[currentStage] || "Unknown",
        eligible,
      },
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
