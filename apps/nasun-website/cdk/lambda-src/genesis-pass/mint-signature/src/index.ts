/**
 * Genesis Pass Mint Signature Lambda
 *
 * POST /genesis-pass/mint-signature (JWT required, empty body)
 *
 * Generates an EIP-712 signature authorizing the caller to mint.
 * All parameters are derived server-side -- the client sends nothing.
 *
 * Security: walletAddress from UserProfiles (server-side), stage/maxQuantity
 * from DynamoDB mintType mapping (fail-closed), signer key from Secrets Manager.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { ethers } from "ethers";

// ── Clients ──

const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const secretsClient = new SecretsManagerClient({});
const ssmClient = new SSMClient({});

// ── Environment validation ──

const ALLOWLIST_TABLE = process.env.ALLOWLIST_TABLE_NAME;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE_NAME;
const SIGNER_SECRET_NAME = process.env.SIGNER_SECRET_NAME;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CHAIN_ID = process.env.CHAIN_ID;
const STAGE_PARAM_NAME = process.env.STAGE_PARAM_NAME;

if (!ALLOWLIST_TABLE || !USER_PROFILES_TABLE || !SIGNER_SECRET_NAME || !CONTRACT_ADDRESS || !CHAIN_ID || !STAGE_PARAM_NAME) {
  throw new Error("Missing required environment variables");
}

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
if (!EVM_ADDRESS_REGEX.test(CONTRACT_ADDRESS)) {
  throw new Error(`Invalid CONTRACT_ADDRESS: ${CONTRACT_ADDRESS}`);
}

const CHAIN_ID_NUM = parseInt(CHAIN_ID, 10);
if (isNaN(CHAIN_ID_NUM)) {
  throw new Error(`Invalid CHAIN_ID: ${CHAIN_ID}`);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());

// ── Mint configuration (server-side, fail-closed) ──

const MINT_CONFIG: Record<string, { stage: number; maxQuantity: number }> = {
  FREE_MINT: { stage: 1, maxQuantity: 1 },
  GUARANTEED: { stage: 2, maxQuantity: 2 },
};
const FCFS_CONFIG = { stage: 3, maxQuantity: 1 };

function getMintConfig(mintType: string | undefined | null): { stage: number; maxQuantity: number } {
  if (mintType == null) return FCFS_CONFIG;
  const config = MINT_CONFIG[mintType];
  if (!config) throw new Error(`Unknown mintType: ${mintType}`);
  return config;
}

// ── EIP-712 constants (hardcoded, must match contract) ──

const EIP712_DOMAIN_NAME = "NasunGenesisPass";
const EIP712_DOMAIN_VERSION = "1";
const SIGNATURE_TTL_SECONDS = 300;

const MINT_TYPES = {
  Mint: [
    { name: "minter", type: "address" },
    { name: "stage", type: "uint8" },
    { name: "maxQuantity", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

// ── Caching ──

let cachedWallet: { wallet: ethers.Wallet; fetchedAt: number } | null = null;
const WALLET_CACHE_TTL_MS = 300_000; // 5 minutes
let cachedStage: { value: string; fetchedAt: number } | null = null;
const STAGE_CACHE_TTL_MS = 60_000;

// Rate limiting: minimum interval between signature issuances per wallet
const SIGNATURE_COOLDOWN_SECONDS = 60;

async function getSignerWallet(): Promise<ethers.Wallet> {
  const now = Date.now();
  if (cachedWallet && now - cachedWallet.fetchedAt < WALLET_CACHE_TTL_MS) {
    return cachedWallet.wallet;
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: SIGNER_SECRET_NAME })
  );

  if (!result.SecretString) throw new Error("Signer secret is empty");
  const { privateKey } = JSON.parse(result.SecretString);
  if (!privateKey) throw new Error("privateKey field missing in secret");

  const wallet = new ethers.Wallet(privateKey);
  cachedWallet = { wallet, fetchedAt: now };
  console.log("[mint-signature] Signer wallet loaded (TTL 5m)");
  return wallet;
}

async function getCurrentStage(): Promise<string> {
  const now = Date.now();
  if (cachedStage && now - cachedStage.fetchedAt < STAGE_CACHE_TTL_MS) {
    return cachedStage.value;
  }

  const result = await ssmClient.send(
    new GetParameterCommand({ Name: STAGE_PARAM_NAME })
  );

  const value = result.Parameter?.Value || "0";
  cachedStage = { value, fetchedAt: now };
  return value;
}

// ── Helpers ──

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getCorsOrigin(origin),
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, origin?: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body),
  };
}

const MAX_LINKED_IDENTITIES = 5;

function collectLinkedIdentityIds(identityId: string, profile?: Record<string, any>): string[] {
  const ids = new Set<string>([identityId]);
  if (!profile) return [...ids];

  if (profile.linkedToPrimaryId && typeof profile.linkedToPrimaryId === "string") {
    ids.add(profile.linkedToPrimaryId);
  }

  if (profile.linkedAccounts && typeof profile.linkedAccounts === "object") {
    for (const [provider, account] of Object.entries(profile.linkedAccounts) as [string, any][]) {
      if (account?.identityId && typeof account.identityId === "string") {
        // Bidirectional check: linked account must reference back to this identity or its primary
        const backRef = account.linkedToPrimaryId;
        if (backRef && backRef !== identityId && backRef !== profile.linkedToPrimaryId) {
          console.warn(`[mint-signature] Skipping suspicious link: ${provider} identity ${account.identityId} points to ${backRef}, not ${identityId}`);
          continue;
        }
        ids.add(account.identityId);
      }
    }
  }

  if (ids.size > MAX_LINKED_IDENTITIES) {
    console.warn(`[mint-signature] Too many linked identities (${ids.size}) for ${identityId}, capping at ${MAX_LINKED_IDENTITIES}`);
    return [...ids].slice(0, MAX_LINKED_IDENTITIES);
  }

  return [...ids];
}

async function findRegistrationByIdentity(identityId: string) {
  const result = await ddbClient.send(
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

async function findRegistrationByAnyIdentity(identityIds: string[]) {
  for (const id of identityIds) {
    const result = await findRegistrationByIdentity(id);
    if (result) return result;
  }
  return null;
}

// ── Handler ──

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(origin), body: "" };
  }

  try {
    // 1. Extract identityId from JWT authorizer
    const identityId = event.requestContext.authorizer?.identityId;
    if (!identityId) {
      return jsonResponse(401, { success: false, error: "UNAUTHORIZED", message: "Authentication required" }, origin);
    }
    console.log(`[mint-signature] Request: identityId=${identityId}`);

    // 2. Resolve MetaMask walletAddress from UserProfiles (server-side)
    const profileResult = await ddbClient.send(
      new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId } })
    );

    if (!profileResult.Item) {
      return jsonResponse(400, { success: false, error: "NO_WALLET", message: "No wallet linked" }, origin);
    }

    const linkedAccounts = profileResult.Item.linkedAccounts;
    const rawWallet = linkedAccounts?.metamask?.walletAddress
      || (profileResult.Item.provider === "MetaMask" ? profileResult.Item.walletAddress : undefined);

    if (!rawWallet) {
      return jsonResponse(400, { success: false, error: "NO_WALLET", message: "No MetaMask wallet linked" }, origin);
    }

    // Validate EVM address format
    let walletAddress: string;
    try {
      walletAddress = ethers.getAddress(rawWallet); // checksum + validate
    } catch {
      console.error(`[mint-signature] Invalid wallet in UserProfiles: ${rawWallet}`);
      return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", message: "Internal error" }, origin);
    }

    // 3. Look up allowlist entry by wallet (PK) or by linked identities
    const normalizedAddress = walletAddress.toLowerCase();
    let allowlistEntry = await ddbClient.send(
      new GetCommand({ TableName: ALLOWLIST_TABLE, Key: { walletAddress: normalizedAddress } })
    ).then((r) => r.Item);

    if (!allowlistEntry) {
      // Try linked identity resolution
      const allIds = collectLinkedIdentityIds(identityId, profileResult.Item);
      allowlistEntry = await findRegistrationByAnyIdentity(allIds);
    }

    // 4. Validate eligibility
    if (!allowlistEntry) {
      console.log(`[mint-signature] Not registered: ${identityId}`);
      return jsonResponse(403, { success: false, error: "NOT_ELIGIBLE", message: "Not eligible" }, origin);
    }

    if (allowlistEntry.status !== "ACTIVE") {
      console.log(`[mint-signature] Not active: ${identityId}, status=${allowlistEntry.status}`);
      return jsonResponse(403, { success: false, error: "NOT_ELIGIBLE", message: "Not eligible" }, origin);
    }

    // Verify identity ownership
    const allIds = collectLinkedIdentityIds(identityId, profileResult.Item);
    if (!allIds.includes(allowlistEntry.identityId)) {
      console.log(`[mint-signature] Identity mismatch: ${identityId}`);
      return jsonResponse(403, { success: false, error: "NOT_ELIGIBLE", message: "Not eligible" }, origin);
    }

    // 5. Derive stage/maxQuantity from mintType (fail-closed)
    let mintConfig: { stage: number; maxQuantity: number };
    try {
      mintConfig = getMintConfig(allowlistEntry.mintType);
    } catch (e: any) {
      console.error(`[mint-signature] Unknown mintType: ${allowlistEntry.mintType}`);
      return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", message: "Internal error" }, origin);
    }

    // 6. Verify current stage matches user's derived stage
    const currentStage = await getCurrentStage();
    if (String(mintConfig.stage) !== currentStage) {
      console.log(`[mint-signature] Stage mismatch: user=${mintConfig.stage}, current=${currentStage}`);
      return jsonResponse(403, { success: false, error: "NOT_ELIGIBLE", message: "Not eligible for current stage" }, origin);
    }

    // 7. Rate limiting: 1 signature per wallet per cooldown period
    const nowEpoch = Math.floor(Date.now() / 1000);
    try {
      await ddbClient.send(
        new UpdateCommand({
          TableName: ALLOWLIST_TABLE,
          Key: { walletAddress: normalizedAddress },
          UpdateExpression: "SET lastSignatureAt = :now",
          ConditionExpression:
            "attribute_not_exists(lastSignatureAt) OR lastSignatureAt < :cooldown",
          ExpressionAttributeValues: {
            ":now": nowEpoch,
            ":cooldown": nowEpoch - SIGNATURE_COOLDOWN_SECONDS,
          },
        })
      );
    } catch (e: any) {
      if (e.name === "ConditionalCheckFailedException") {
        console.log(`[mint-signature] Rate limited: ${normalizedAddress}`);
        return jsonResponse(429, {
          success: false,
          error: "RATE_LIMITED",
          message: "Please wait before requesting another signature.",
        }, origin);
      }
      throw e;
    }

    // 8. Get signer wallet from Secrets Manager
    const signerWallet = await getSignerWallet();

    // 9. Generate EIP-712 signature
    const deadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;

    const domain = {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: CHAIN_ID_NUM,
      verifyingContract: CONTRACT_ADDRESS,
    };

    const value = {
      minter: walletAddress,
      stage: mintConfig.stage,
      maxQuantity: mintConfig.maxQuantity,
      deadline,
    };

    const signature = await signerWallet.signTypedData(domain, MINT_TYPES, value);

    console.log(`[mint-signature] Signed: wallet=${normalizedAddress}, stage=${mintConfig.stage}, maxQty=${mintConfig.maxQuantity}, deadline=${deadline}`);

    // 10. Return signature
    return jsonResponse(200, {
      success: true,
      data: {
        signature,
        deadline,
        walletAddress,
        stage: mintConfig.stage,
        maxQuantity: mintConfig.maxQuantity,
      },
    }, origin);
  } catch (error: any) {
    console.error("[mint-signature] Error:", error.message || error);
    return jsonResponse(500, { success: false, error: "INTERNAL_ERROR", message: "Signature generation failed" }, origin);
  }
}
