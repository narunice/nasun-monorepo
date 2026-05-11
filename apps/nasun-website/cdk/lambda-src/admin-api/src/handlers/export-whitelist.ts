import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import { timingSafeEqual } from "crypto";
import {
  DynamoDBClient,
  ScanCommand,
  GetItemCommand,
  QueryCommand,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { verifyAdminRole, extractIdentityIdFromAuthorizer, verifyTokenManually } from "../utils/auth.js";
import { generateCSV, generateFilename } from "../utils/csv.js";
import { corsHeaders, csvResponse, jsonResponse, errorResponse, unauthorizedResponse } from "../utils/response.js";
import { uploadAndPresign, getS3Object } from "../utils/s3-offload.js";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { grantIfReferralActivated } from "../utils/onboardingBonus.js";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Table and Bucket names
const GENESIS_TABLE = process.env.GENESIS_TABLE || "GenesisNftWhitelist";
const BATTALION_TABLE = process.env.BATTALION_TABLE || "nasun-nft-whitelist";
const HIDDEN_PROPOSALS_TABLE = process.env.HIDDEN_PROPOSALS_TABLE || "HiddenProposals";
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";
const DEVNET_METRICS_TABLE = process.env.DEVNET_METRICS_TABLE || "devnet-metrics";
const GENESIS_PASS_TABLE = process.env.GENESIS_PASS_TABLE || "nasun-genesis-pass-allowlist";
const USER_WALLETS_TABLE = process.env.USER_WALLETS_TABLE || "UserWallets";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "";
const REFERRAL_CODES_TABLE = process.env.REFERRAL_CODES_TABLE || "nasun-referral-codes";
const REFERRALS_TABLE = process.env.REFERRALS_TABLE || "nasun-referrals";
const ACTIVATIONS_TABLE = process.env.ACTIVATIONS_TABLE || "nasun-ecosystem-activations";
const INTERNAL_CACHE_BUCKET = process.env.INTERNAL_CACHE_BUCKET || "";

// S3 Cache Configuration
const USER_LIST_CACHE_KEY = "internal/user-list-full-cache.json.gz";

// Simple in-memory cache fallback for the current execution
let cachedUsers: UserProfileItem[] | null = null;
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes in-memory

interface GenesisWhitelistItem {
  walletAddress: string;
  joinedAt: string;
  signature?: string;
  status: string;
  withdrawnAt?: string;
  [key: string]: string | undefined;
}

interface BattalionWhitelistItem {
  walletAddress: string;
  verifiedAt: string;
  xUserId?: string;
  xUsername?: string;
  allowlistBatchId?: string;
  status: string;
  [key: string]: string | undefined;
}

interface HiddenProposal {
  proposalId: string;
  hiddenAt: number;
  hiddenBy: string;
}

// Whitelisted fields for user profile responses (security: never return raw DynamoDB items)
const USER_LIST_FIELDS = [
  "identityId", "username", "email", "provider", "twitterHandle",
  "originalTwitterHandle", "twitterId", "profileImageUrl", "walletAddress",
  "role", "verified", "isTelegramMember", "telegramUserId", "telegramUsername",
  "createdAt", "updatedAt", "status", "linkedToPrimaryId", "linkedAccounts",
  "googleEmail", "linkedProviders", "probableBot", "botTier",
  "customDisplayName",
] as const;

// Provider keys that represent social connections (not wallets)
const SOCIAL_PROVIDER_KEYS = new Set(["twitter", "google"]);

interface UserProfileItem {
  identityId: string;
  username?: string;
  email?: string;
  provider?: string;
  twitterHandle?: string;
  originalTwitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
  walletAddress?: string;
  role?: string;
  verified?: boolean;
  isTelegramMember?: boolean;
  telegramUserId?: string;
  telegramUsername?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  linkedAccounts?: Record<string, unknown>;
  linkedToPrimaryId?: string;
  googleEmail?: string;
  linkedProviders: string[];
  probableBot?: boolean;
  botTier?: number;
}

function parseUserProfileItem(item: Record<string, any>): UserProfileItem {
  // Parse linkedAccounts in a single pass: walletAddress fallback + social providers + googleEmail + twitter fallback
  let walletAddress = item.walletAddress?.S;
  let googleEmail: string | undefined;
  let twitterHandle = item.twitterHandle?.S;
  let originalTwitterHandle = item.originalTwitterHandle?.S;
  let twitterId = item.twitterId?.S;
  const linkedProviders: string[] = [];

  if (item.linkedAccounts?.M) {
    const linked = item.linkedAccounts.M as Record<string, any>;
    // Wallet fallback from linked accounts
    if (!walletAddress) {
      walletAddress =
        linked["nasun wallet"]?.M?.walletAddress?.S ||
        linked.metamask?.M?.walletAddress?.S;
    }
    // Extract social connections, google email, and twitter fallback
    for (const key of Object.keys(linked)) {
      if (SOCIAL_PROVIDER_KEYS.has(key)) {
        linkedProviders.push(key);
        if (key === "google") {
          googleEmail = linked.google?.M?.email?.S;
        }
        if (key === "twitter" && !twitterHandle) {
          twitterHandle = linked.twitter?.M?.twitterHandle?.S;
          originalTwitterHandle = linked.twitter?.M?.originalTwitterHandle?.S;
          twitterId = linked.twitter?.M?.twitterId?.S;
        }
      }
    }
  }

  // Fallback: if primary provider is Google, use top-level email as googleEmail
  if (!googleEmail && item.provider?.S === "Google" && item.email?.S) {
    googleEmail = item.email.S;
  }

  return {
    identityId: item.identityId?.S || "",
    username: item.username?.S,
    email: item.email?.S,
    provider: item.provider?.S,
    twitterHandle,
    originalTwitterHandle,
    twitterId,
    profileImageUrl: item.profileImageUrl?.S,
    walletAddress,
    role: item.role?.S,
    verified: item.verified?.BOOL,
    isTelegramMember: item.isTelegramMember?.BOOL,
    telegramUserId: item.telegramUserId?.S,
    telegramUsername: item.telegramUsername?.S,
    createdAt: item.createdAt?.S,
    updatedAt: item.updatedAt?.S,
    status: item.status?.S,
    linkedToPrimaryId: item.linkedToPrimaryId?.S,
    googleEmail,
    linkedProviders,
    probableBot: item.probableBot?.BOOL ?? false,
    botTier: item.botTier?.N ? Number(item.botTier.N) : undefined,
  };
}

function parseUserProfileDetail(item: Record<string, any>): UserProfileItem {
  const profile = parseUserProfileItem(item);
  // Include linkedAccounts only for detail view
  if (item.linkedAccounts?.M) {
    const linked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item.linkedAccounts.M as Record<string, any>)) {
      if (value?.M) {
        const account: Record<string, string> = {};
        for (const [field, val] of Object.entries(value.M as Record<string, any>)) {
          if (val?.S) account[field] = val.S;
        }
        linked[key] = account;
      }
    }
    profile.linkedAccounts = linked;
  }
  return profile;
}

// Strip internal fields for list responses
function toListItem(profile: UserProfileItem): Omit<UserProfileItem, "linkedAccounts" | "linkedToPrimaryId"> {
  const { linkedAccounts: _, linkedToPrimaryId: __, ...rest } = profile;
  return rest;
}

/**
 * Scan all hidden proposal IDs from DynamoDB
 */
async function scanHiddenProposals(): Promise<HiddenProposal[]> {
  const items: HiddenProposal[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const command = new ScanCommand({
      TableName: HIDDEN_PROPOSALS_TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const result = await dynamoClient.send(command);

    if (result.Items) {
      for (const item of result.Items) {
        items.push({
          proposalId: item.proposalId?.S || "",
          hiddenAt: Number(item.hiddenAt?.N) || 0,
          hiddenBy: item.hiddenBy?.S || "",
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Hide a proposal by adding it to the HiddenProposals table
 */
async function hideProposal(proposalId: string, adminIdentityId: string): Promise<void> {
  const command = new PutItemCommand({
    TableName: HIDDEN_PROPOSALS_TABLE,
    Item: {
      proposalId: { S: proposalId },
      hiddenAt: { N: String(Date.now()) },
      hiddenBy: { S: adminIdentityId },
    },
  });

  await dynamoClient.send(command);
}

/**
 * Unhide a proposal by removing it from the HiddenProposals table
 */
async function unhideProposal(proposalId: string): Promise<void> {
  const command = new DeleteItemCommand({
    TableName: HIDDEN_PROPOSALS_TABLE,
    Key: {
      proposalId: { S: proposalId },
    },
  });

  await dynamoClient.send(command);
}

/**
 * Scan all items from Genesis NFT Whitelist table
 */
async function scanGenesisWhitelist(status?: string): Promise<GenesisWhitelistItem[]> {
  const items: GenesisWhitelistItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const command = new ScanCommand({
      TableName: GENESIS_TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
      FilterExpression: status && status !== "ALL" ? "#status = :status" : undefined,
      ExpressionAttributeNames: status && status !== "ALL" ? { "#status": "status" } : undefined,
      ExpressionAttributeValues: status && status !== "ALL" ? { ":status": { S: status } } : undefined,
    });

    const result = await dynamoClient.send(command);

    if (result.Items) {
      for (const item of result.Items) {
        items.push({
          walletAddress: item.walletAddress?.S || "",
          joinedAt: item.joinedAt?.S || "",
          signature: item.signature?.S,
          status: item.status?.S || "ACTIVE",
          withdrawnAt: item.withdrawnAt?.S,
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

interface GenesisPassItem {
  walletAddress: string;
  identityId: string;
  registeredAt: string;
  status: string;
  mintType?: string;
  source?: string;
  twitterHandle?: string;
  probableBot?: boolean;
}

/**
 * Scan all items from Genesis Pass Allowlist table
 */
async function scanGenesisPassAllowlist(status?: string): Promise<GenesisPassItem[]> {
  const items: GenesisPassItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const command = new ScanCommand({
      TableName: GENESIS_PASS_TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
      FilterExpression: status && status !== "ALL" ? "#status = :status" : undefined,
      ExpressionAttributeNames: status && status !== "ALL" ? { "#status": "status" } : undefined,
      ExpressionAttributeValues: status && status !== "ALL" ? { ":status": { S: status } } : undefined,
    });

    const result = await dynamoClient.send(command);

    if (result.Items) {
      for (const item of result.Items) {
        items.push({
          walletAddress: item.walletAddress?.S || "",
          identityId: item.identityId?.S || "",
          registeredAt: item.registeredAt?.S || "",
          status: item.status?.S || "ACTIVE",
          mintType: item.mintType?.S,
          source: item.source?.S,
          twitterHandle: item.twitterHandle?.S,
          probableBot: item.probableBot?.BOOL ?? false,
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Scan UserProfiles for identityId -> twitterHandle mapping (lightweight)
 */
async function scanTwitterHandleMap(): Promise<Map<string, string>> {
  const handleMap = new Map<string, string>();
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: USER_PROFILES_TABLE,
      ProjectionExpression: "identityId, twitterHandle",
      ExclusiveStartKey: lastEvaluatedKey,
    }));

    if (result.Items) {
      for (const item of result.Items) {
        const id = item.identityId?.S;
        const handle = item.twitterHandle?.S;
        if (id && handle) handleMap.set(id, handle);
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return handleMap;
}

/**
 * Query Battalion NFT Whitelist with optional date filtering using batch-index GSI
 */
async function queryBattalionWhitelist(
  startDate?: string,
  endDate?: string,
  batchId?: string
): Promise<BattalionWhitelistItem[]> {
  const items: BattalionWhitelistItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  // If batchId is provided, use GSI query; otherwise, scan
  const useGSI = !!batchId;

  do {
    let command;

    if (useGSI) {
      // Query using batch-index GSI
      let keyCondition = "allowlistBatchId = :batchId";
      const expressionValues: Record<string, any> = {
        ":batchId": { S: batchId },
      };

      // Add date range filter on sort key (verifiedAt)
      if (startDate && endDate) {
        keyCondition += " AND verifiedAt BETWEEN :startDate AND :endDate";
        expressionValues[":startDate"] = { S: startDate };
        expressionValues[":endDate"] = { S: endDate + "T23:59:59.999Z" };
      } else if (startDate) {
        keyCondition += " AND verifiedAt >= :startDate";
        expressionValues[":startDate"] = { S: startDate };
      } else if (endDate) {
        keyCondition += " AND verifiedAt <= :endDate";
        expressionValues[":endDate"] = { S: endDate + "T23:59:59.999Z" };
      }

      command = new QueryCommand({
        TableName: BATTALION_TABLE,
        IndexName: "batch-index",
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        ExclusiveStartKey: lastEvaluatedKey,
      });
    } else {
      // Full scan with filter
      let filterExpression: string | undefined;
      const expressionValues: Record<string, any> = {};
      const filters: string[] = [];

      if (startDate) {
        filters.push("verifiedAt >= :startDate");
        expressionValues[":startDate"] = { S: startDate };
      }
      if (endDate) {
        filters.push("verifiedAt <= :endDate");
        expressionValues[":endDate"] = { S: endDate + "T23:59:59.999Z" };
      }

      if (filters.length > 0) {
        filterExpression = filters.join(" AND ");
      }

      command = new ScanCommand({
        TableName: BATTALION_TABLE,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: Object.keys(expressionValues).length > 0 ? expressionValues : undefined,
        ExclusiveStartKey: lastEvaluatedKey,
      });
    }

    const result = await dynamoClient.send(command);

    if (result.Items) {
      for (const item of result.Items) {
        items.push({
          walletAddress: item.walletAddress?.S || "",
          verifiedAt: item.verifiedAt?.S || item.timestamp?.S || "",
          xUserId: item.xUserId?.S,
          xUsername: item.xUsername?.S,
          allowlistBatchId: item.allowlistBatchId?.S,
          status: item.status?.S || "ACTIVE",
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Sort by verifiedAt descending
  items.sort((a, b) => (b.verifiedAt || "").localeCompare(a.verifiedAt || ""));

  return items;
}

/**
 * Main handler for whitelist export
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(requestOrigin), body: "" };
  }

  console.log("Admin Export API called:", {
    httpMethod: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
  });

  const path = event.path;

  try {
    // Public endpoint: GET /hidden-proposals (no auth required)
    // This allows the public governance page to filter hidden proposals
    if (path.endsWith("/hidden-proposals") && event.httpMethod === "GET") {
      console.log("Fetching hidden proposals (public)");
      const items = await scanHiddenProposals();
      return jsonResponse(200, { proposalIds: items.map((i) => i.proposalId) }, requestOrigin);
    }

    // Internal endpoint: GET /internal/wallet-mappings (API key auth, no Cognito)
    // Returns all wallet->identity mappings + genesis pass holders for the points scanner
    if (path.endsWith("/wallet-mappings") && event.httpMethod === "GET") {
      const apiKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
      const isValidKey =
        INTERNAL_API_KEY &&
        apiKey &&
        apiKey.length === INTERNAL_API_KEY.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(INTERNAL_API_KEY));
      if (!isValidKey) {
        console.warn("[internal] Invalid or missing API key");
        return errorResponse(401, "Unauthorized", requestOrigin);
      }

      console.log("[internal] Fetching wallet mappings for points scanner");

      // Scan UserWallets for all registered wallets (exclude WALLET_OWNER sentinel rows)
      const wallets: Record<string, string> = {};
      let lastKey: Record<string, any> | undefined;
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: USER_WALLETS_TABLE,
            FilterExpression: "identityId <> :sentinel",
            ExpressionAttributeValues: { ":sentinel": { S: "WALLET_OWNER" } },
            ProjectionExpression: "identityId, walletAddress",
            ...(lastKey && { ExclusiveStartKey: lastKey }),
          })
        );
        for (const item of result.Items || []) {
          const addr = item.walletAddress?.S;
          const id = item.identityId?.S;
          if (addr && id) {
            wallets[addr.toLowerCase()] = id;
          }
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      // Genesis Pass holder identification has moved to /internal/ecosystem-activations
      // (Alchemy on-chain snapshot). The legacy drop allowlist is no longer used for
      // multiplier eligibility; see docs/ecosystem-points-system.md.
      const payload = { wallets };
      console.log(`[internal] Wallet mappings: ${Object.keys(wallets).length} wallets`);

      // Offload to S3 to avoid Lambda 6MB response limit
      const url = await uploadAndPresign("internal/wallet-mappings.json.gz", payload);
      return jsonResponse(200, { url }, requestOrigin);
    }

    // Internal endpoint: GET /internal/referral-mappings (API key auth, no Cognito)
    // Returns ACTIVATED referral relationships only for points scanner bonus calculation.
    // PENDING referrals are excluded to prevent bonus payouts for unverified signups.
    if (path.endsWith("/referral-mappings") && event.httpMethod === "GET") {
      const apiKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
      const isValidKey =
        INTERNAL_API_KEY &&
        apiKey &&
        apiKey.length === INTERNAL_API_KEY.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(INTERNAL_API_KEY));
      if (!isValidKey) {
        console.warn("[internal] Invalid or missing API key for referral-mappings");
        return errorResponse(401, "Unauthorized", requestOrigin);
      }

      console.log("[internal] Fetching referral mappings for points scanner");

      // Scan nasun-referrals table, only include ACTIVATED + non-expired referrals.
      // Expiry: 180 days from activatedAt (admin approval) — manual-review model
      // means review-wait time should not eat into the bonus window. Legacy rows
      // missing activatedAt fall back to appliedAt (and rows missing both are
      // treated as non-expired to avoid losing legacy ACTIVATED records).
      // Each entry includes activatedAt so the daily bonus job can skip dates
      // that predate approval.
      const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      // Dual-shape: keep legacy `referrals: Record<id,id>` for old scanners
      // AND emit `referralsV2: Record<id,{referrerId,activatedAt}>` for new
      // scanners that need activatedAt to skip pre-approval txs. Old scanners
      // ignore unknown keys; new scanners prefer V2 and fall back to legacy.
      const referrals: Record<string, string> = {};
      const referralsV2: Record<string, { referrerId: string; activatedAt: string | null }> = {};
      let totalRelationships = 0;
      let totalActivated = 0;
      let totalExpired = 0;
      let refLastKey: Record<string, any> | undefined;
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: REFERRALS_TABLE,
            ProjectionExpression: "referredIdentityId, referrerIdentityId, #s, appliedAt, activatedAt",
            ExpressionAttributeNames: { "#s": "status" },
            ...(refLastKey && { ExclusiveStartKey: refLastKey }),
          })
        );
        for (const item of result.Items || []) {
          const referredId = item.referredIdentityId?.S;
          const referrerId = item.referrerIdentityId?.S;
          const status = item.status?.S;
          if (referredId && referrerId) {
            totalRelationships++;
            if (status === "ACTIVATED") {
              // Expiry from activatedAt (admin approval), not appliedAt.
              // Fall back to appliedAt for legacy rows where activatedAt
              // wasn't recorded; if both absent, treat as non-expired
              // (preserves legacy behavior, prevents data loss).
              const activatedAt = item.activatedAt?.S;
              const appliedAt = item.appliedAt?.S;
              const expiryAnchor = activatedAt || appliedAt;
              if (expiryAnchor) {
                const anchorMs = Date.parse(expiryAnchor);
                if (!isNaN(anchorMs) && now - anchorMs > EXPIRY_MS) {
                  totalExpired++;
                  continue;
                }
              }
              referrals[referredId] = referrerId;
              referralsV2[referredId] = {
                referrerId,
                activatedAt: item.activatedAt?.S || null,
              };
              totalActivated++;
            }
          }
        }
        refLastKey = result.LastEvaluatedKey;
      } while (refLastKey);

      const payload = {
        version: 2,
        referrals,
        referralsV2,
        stats: { totalRelationships, totalActivated },
      };
      console.log(`[internal] Referral mappings: ${totalRelationships} total, ${totalActivated} activated (returned), ${totalExpired} expired (filtered)`);

      // Offload to S3 to avoid Lambda 6MB response limit
      const url = await uploadAndPresign("internal/referral-mappings.json.gz", payload);
      return jsonResponse(200, { url }, requestOrigin);
    }

    // Internal endpoint: POST /internal/referral-activate (API key auth, no Cognito)
    // Batch-activates PENDING referrals by identityId list.
    // Called by points scanner when referred users have >= 5 distinct activity days.
    if (path.endsWith("/referral-activate") && event.httpMethod === "POST") {
      const apiKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
      const isValidKey =
        INTERNAL_API_KEY &&
        apiKey &&
        apiKey.length === INTERNAL_API_KEY.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(INTERNAL_API_KEY));
      if (!isValidKey) {
        console.warn("[internal] Invalid or missing API key for referral-activate");
        return errorResponse(401, "Unauthorized", requestOrigin);
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const identityIds = body.identityIds as string[] | undefined;
      if (!identityIds || !Array.isArray(identityIds) || identityIds.length === 0) {
        return errorResponse(400, "identityIds array is required", requestOrigin);
      }
      if (identityIds.length > 100) {
        return errorResponse(400, "Max 100 identityIds per batch", requestOrigin);
      }

      console.log(`[internal] Activating ${identityIds.length} referrals`);
      const now = new Date().toISOString();
      let activated = 0;
      let skipped = 0;

      for (const referredId of identityIds) {
        try {
          await dynamoClient.send(
            new UpdateItemCommand({
              TableName: REFERRALS_TABLE,
              Key: { referredIdentityId: { S: referredId } },
              UpdateExpression: "SET #s = :activated, activatedAt = :now",
              ConditionExpression: "#s = :pending",
              ExpressionAttributeNames: { "#s": "status" },
              ExpressionAttributeValues: {
                ":activated": { S: "ACTIVATED" },
                ":pending": { S: "PENDING" },
                ":now": { S: now },
              },
            })
          );
          activated++;
        } catch (err: any) {
          if (err.name === "ConditionalCheckFailedException") {
            skipped++; // Already activated or doesn't exist
          } else {
            console.error(`[internal] Failed to activate referral ${referredId}:`, err.message);
            skipped++;
          }
        }
      }

      console.log(`[internal] Referral activation: ${activated} activated, ${skipped} skipped`);
      return jsonResponse(200, { activated, skipped }, requestOrigin);
    }

    // Internal endpoint: GET /internal/ecosystem-activations (API key auth, no Cognito)
    // Returns all ACTIVE NFT activations grouped by identityId for ecosystem score multiplier.
    // Called by explorer-api points scanner to apply NFT multipliers.
    if (path.endsWith("/ecosystem-activations") && event.httpMethod === "GET") {
      const apiKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
      const isValidKey =
        INTERNAL_API_KEY &&
        apiKey &&
        apiKey.length === INTERNAL_API_KEY.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(INTERNAL_API_KEY));
      if (!isValidKey) {
        console.warn("[internal] Invalid or missing API key for ecosystem-activations");
        return errorResponse(401, "Unauthorized", requestOrigin);
      }

      console.log("[internal] Fetching ecosystem activations for points scanner");

      // Scan nasun-ecosystem-activations table for ACTIVE entries
      const activations: Record<string, Array<{ nftType: string; nftCount: number }>> = {};
      let actLastKey: Record<string, any> | undefined;
      let totalActive = 0;
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: ACTIVATIONS_TABLE,
            FilterExpression: "#s = :active",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":active": { S: "ACTIVE" } },
            ProjectionExpression: "identityId, sk, nftCount",
            ...(actLastKey && { ExclusiveStartKey: actLastKey }),
          })
        );
        for (const item of result.Items || []) {
          const id = item.identityId?.S;
          const sk = item.sk?.S; // format: nftType#walletAddress
          const nftCount = Number(item.nftCount?.N ?? "1");
          if (id && sk) {
            const nftType = sk.split("#")[0];
            if (!activations[id]) activations[id] = [];
            activations[id].push({ nftType, nftCount });
            totalActive++;
          }
        }
        actLastKey = result.LastEvaluatedKey;
      } while (actLastKey);

      const payload = { activations };
      console.log(`[internal] Ecosystem activations: ${totalActive} active across ${Object.keys(activations).length} users`);

      // Offload to S3 to avoid Lambda 6MB response limit
      const url = await uploadAndPresign("internal/ecosystem-activations.json.gz", payload);
      return jsonResponse(200, { url }, requestOrigin);
    }

    // Internal endpoint: GET /internal/ecosystem-activations/{identityId} (API key auth)
    // Returns ACTIVE NFT activations for a single user. Used by explorer-api per-user sync.
    if (path.match(/\/internal\/ecosystem-activations\/[^/]+$/) && event.httpMethod === "GET") {
      const apiKey = event.headers?.["x-api-key"] || event.headers?.["X-Api-Key"];
      const isValidKey =
        INTERNAL_API_KEY &&
        apiKey &&
        apiKey.length === INTERNAL_API_KEY.length &&
        timingSafeEqual(Buffer.from(apiKey), Buffer.from(INTERNAL_API_KEY));
      if (!isValidKey) {
        return errorResponse(401, "Unauthorized", requestOrigin);
      }

      const targetIdentityId = event.pathParameters?.identityId;
      if (!targetIdentityId || !/^[\w-]+:[\w-]{36}$/.test(targetIdentityId)) {
        return errorResponse(400, "Invalid identityId format", requestOrigin);
      }

      const userActivations: Array<{ nftType: string; nftCount: number }> = [];
      let lastKey: Record<string, any> | undefined;
      do {
        const result = await dynamoClient.send(
          new QueryCommand({
            TableName: ACTIVATIONS_TABLE,
            KeyConditionExpression: "identityId = :id",
            FilterExpression: "#s = :active",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":id": { S: targetIdentityId },
              ":active": { S: "ACTIVE" },
            },
            ProjectionExpression: "sk, nftCount",
            ...(lastKey && { ExclusiveStartKey: lastKey }),
          })
        );
        for (const item of result.Items || []) {
          const sk = item.sk?.S;
          const nftCount = Number(item.nftCount?.N ?? "1");
          if (sk) {
            userActivations.push({ nftType: sk.split("#")[0], nftCount });
          }
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      return jsonResponse(200, { identityId: targetIdentityId, activations: userActivations }, requestOrigin);
    }

    // All other endpoints require admin authentication.
    // Try Token Authorizer context first, fall back to manual token verification.
    let identityId = extractIdentityIdFromAuthorizer(event.requestContext);
    if (!identityId) {
      const authHeader = event.headers?.Authorization || event.headers?.authorization;
      identityId = await verifyTokenManually(authHeader);
    }

    if (!identityId) {
      console.warn("No identityId provided");
      return unauthorizedResponse(requestOrigin);
    }

    const admin = await verifyAdminRole(identityId);
    if (!admin) {
      console.warn(`Unauthorized access attempt by: ${identityId}`);
      return unauthorizedResponse(requestOrigin);
    }

    console.log(`Admin verified: ${admin.email} (${admin.identityId})`);
    const queryParams = event.queryStringParameters || {};
    const VALID_STATUSES = ["ACTIVE", "APPLIED", "LEGACY", "WITHDRAWN", "ALL"];

    // GET /export/genesis - Export Genesis NFT Whitelist
    if (path.endsWith("/genesis") && event.httpMethod === "GET") {
      const status = queryParams.status || "ACTIVE";
      const format = queryParams.format; // "opensea" for OpenSea format

      console.log(`Exporting Genesis whitelist (status: ${status}, format: ${format || "default"})`);
      const items = await scanGenesisWhitelist(status);

      let csv: string;
      let filename: string;

      if (format === "opensea") {
        // OpenSea allowlist format
        csv = generateCSV(
          items.map((item) => ({ walletAddress: item.walletAddress, mintLimit: "", price: "" })),
          [
            { key: "walletAddress", header: "Wallet address" },
            { key: "mintLimit", header: "Custom mint limit (optional)" },
            { key: "price", header: "Custom price in native token e.g. ETH (optional)" },
          ]
        );
        filename = generateFilename("frontiers-opensea-allowlist", status.toLowerCase());
      } else {
        // Default format
        csv = generateCSV(items, [
          { key: "walletAddress", header: "walletAddress" },
          { key: "joinedAt", header: "joinedAt" },
          { key: "signature", header: "signature" },
          { key: "status", header: "status" },
          { key: "withdrawnAt", header: "withdrawnAt" },
        ]);
        filename = generateFilename("frontiers-whitelist", status.toLowerCase());
      }

      console.log(`Generated CSV: ${items.length} items, filename: ${filename}`);
      return csvResponse(csv, filename, requestOrigin);
    }

    // GET /export/genesis-pass - Export Genesis Pass Allowlist
    if (path.endsWith("/genesis-pass") && event.httpMethod === "GET") {
      const status = queryParams.status || "ACTIVE";
      if (!VALID_STATUSES.includes(status)) {
        return jsonResponse(400, { error: `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}` }, requestOrigin);
      }
      const format = queryParams.format;

      let mintType = queryParams.mintType;
      const VALID_MINT_TYPES = ["FREE_MINT", "GUARANTEED", "STANDARD", "FCFS"];
      if (mintType && !VALID_MINT_TYPES.includes(mintType)) {
        return jsonResponse(400, { error: `Invalid mintType: ${mintType}. Must be one of: ${VALID_MINT_TYPES.join(", ")}` }, requestOrigin);
      }
      // FCFS is an alias for STANDARD (entries without mintType)
      if (mintType === "FCFS") mintType = "STANDARD";

      console.log(`Exporting Genesis Pass allowlist (status: ${status}, format: ${format || "default"}, mintType: ${mintType || "ALL"})`);
      let items = await scanGenesisPassAllowlist(status);

      // Filter by mintType if specified (STANDARD = entries without mintType)
      if (mintType) {
        if (mintType === "STANDARD") {
          items = items.filter(item => !item.mintType);
        } else {
          items = items.filter(item => item.mintType === mintType);
        }
      }

      // Enrich twitterHandle from UserProfiles for entries missing it
      try {
        const handleMap = await scanTwitterHandleMap();
        for (const item of items) {
          if (!item.twitterHandle && item.identityId) {
            item.twitterHandle = handleMap.get(item.identityId);
          }
        }
      } catch (err) {
        console.warn("[export] Failed to enrich twitterHandle:", err);
      }

      let csv: string;
      let filename: string;

      if (format === "opensea") {
        csv = generateCSV(
          items.map((item) => ({ walletAddress: item.walletAddress, mintLimit: "", price: "" })),
          [
            { key: "walletAddress", header: "Wallet address" },
            { key: "mintLimit", header: "Custom mint limit (optional)" },
            { key: "price", header: "Custom price in native token e.g. ETH (optional)" },
          ]
        );
        const mintSuffix = mintType ? `-${mintType.toLowerCase().replace("_", "-")}` : "";
        filename = generateFilename(`genesis-pass-opensea${mintSuffix}-allowlist`, status.toLowerCase());
      } else {
        csv = generateCSV(items, [
          { key: "walletAddress", header: "walletAddress" },
          { key: "identityId", header: "identityId" },
          { key: "twitterHandle", header: "twitterHandle" },
          { key: "mintType", header: "mintType" },
          { key: "source", header: "source" },
          { key: "registeredAt", header: "registeredAt" },
          { key: "status", header: "status" },
        ]);
        filename = generateFilename("genesis-pass-allowlist", status.toLowerCase());
      }

      console.log(`Generated CSV: ${items.length} items, filename: ${filename}`);
      return csvResponse(csv, filename, requestOrigin);
    }

    // GET /export/battalion - Export Battalion NFT Allowlist
    if (path.endsWith("/battalion") && event.httpMethod === "GET") {
      const { startDate, endDate, batchId } = queryParams;
      const format = queryParams.format; // "opensea" for OpenSea format

      console.log(`Exporting Battalion allowlist (startDate: ${startDate}, endDate: ${endDate}, batchId: ${batchId}, format: ${format || "default"})`);
      const items = await queryBattalionWhitelist(startDate, endDate, batchId);

      let csv: string;
      let filename: string;
      let suffix = "all";
      if (startDate || endDate) {
        suffix = `${startDate || "start"}-to-${endDate || "end"}`;
      }

      if (format === "opensea") {
        // OpenSea allowlist format
        csv = generateCSV(
          items.map((item) => ({ walletAddress: item.walletAddress, mintLimit: "", price: "" })),
          [
            { key: "walletAddress", header: "Wallet address" },
            { key: "mintLimit", header: "Custom mint limit (optional)" },
            { key: "price", header: "Custom price in native token e.g. ETH (optional)" },
          ]
        );
        filename = generateFilename("battalion-nft-opensea-allowlist", suffix);
      } else {
        // Default format
        csv = generateCSV(items, [
          { key: "walletAddress", header: "walletAddress" },
          { key: "verifiedAt", header: "verifiedAt" },
          { key: "xUserId", header: "xUserId" },
          { key: "xUsername", header: "xUsername" },
          { key: "status", header: "status" },
        ]);
        filename = generateFilename("battalion-nft-allowlist", suffix);
      }

      console.log(`Generated CSV: ${items.length} items, filename: ${filename}`);
      return csvResponse(csv, filename, requestOrigin);
    }

    // GET /export/stats - Get whitelist statistics with status breakdown
    if (path.endsWith("/stats") && event.httpMethod === "GET") {
      // Scan all items to count by status
      const [genesisItems, battalionItems, genesisPassItems] = await Promise.all([
        scanGenesisWhitelist("ALL"),
        queryBattalionWhitelist(),
        scanGenesisPassAllowlist("ALL"),
      ]);

      // Count Genesis (legacy) by status
      const genesisActive = genesisItems.filter((item) => item.status === "ACTIVE").length;
      const genesisWithdrawn = genesisItems.filter((item) => item.status === "WITHDRAWN").length;

      // Count Battalion by status (assuming ACTIVE if no status field)
      const battalionActive = battalionItems.filter(
        (item) => !item.status || item.status === "ACTIVE"
      ).length;
      const battalionWithdrawn = battalionItems.filter(
        (item) => item.status === "WITHDRAWN"
      ).length;

      // Count Genesis Pass by status
      const genesisPassActive = genesisPassItems.filter((item) => item.status === "ACTIVE").length;
      const genesisPassWithdrawn = genesisPassItems.filter((item) => item.status === "WITHDRAWN").length;
      // Paid mint: non-LEGACY, non-WITHDRAWN, not FREE_MINT (includes GUARANTEED and standard)
      const genesisPassPaidApplied = genesisPassItems.filter(
        (item) => !["LEGACY", "WITHDRAWN"].includes(item.status) && item.mintType !== "FREE_MINT"
      ).length;

      // Bot-excluded counts
      const genesisPassBotCount = genesisPassItems.filter((item) => item.probableBot).length;
      const genesisPassPaidBotCount = genesisPassItems.filter(
        (item) => item.probableBot && !["LEGACY", "WITHDRAWN"].includes(item.status) && item.mintType !== "FREE_MINT"
      ).length;

      return jsonResponse(
        200,
        {
          genesis: {
            active: genesisActive,
            withdrawn: genesisWithdrawn,
            total: genesisItems.length,
          },
          battalion: {
            active: battalionActive,
            withdrawn: battalionWithdrawn,
            total: battalionItems.length,
          },
          genesisPass: {
            active: genesisPassActive,
            withdrawn: genesisPassWithdrawn,
            total: genesisPassItems.length,
            paidApplied: genesisPassPaidApplied,
            botCount: genesisPassBotCount,
            paidAppliedExBot: genesisPassPaidApplied - genesisPassPaidBotCount,
            totalExBot: genesisPassItems.length - genesisPassBotCount,
          },
        },
        requestOrigin
      );
    }

    // POST /hidden-proposals - Hide a proposal (admin only)
    if (path.endsWith("/hidden-proposals") && event.httpMethod === "POST") {
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON in request body", requestOrigin);
      }
      const { proposalId } = body;

      if (!proposalId || typeof proposalId !== "string") {
        return errorResponse(400, "Missing required field: proposalId", requestOrigin);
      }

      console.log(`Hiding proposal: ${proposalId} by admin: ${admin.identityId}`);
      await hideProposal(proposalId, admin.identityId);
      return jsonResponse(200, { success: true, proposalId }, requestOrigin);
    }

    // DELETE /hidden-proposals/{proposalId} - Unhide a proposal
    if (path.includes("/hidden-proposals/") && event.httpMethod === "DELETE") {
      const proposalId = event.pathParameters?.proposalId;

      if (!proposalId) {
        return errorResponse(400, "Missing proposalId in path", requestOrigin);
      }

      console.log(`Unhiding proposal: ${proposalId}`);
      await unhideProposal(proposalId);
      return jsonResponse(200, { success: true, proposalId }, requestOrigin);
    }

    // GET /users/{identityId} - Get single user detail
    if (path.match(/\/users\/[^/]+$/) && event.httpMethod === "GET" && event.pathParameters?.identityId) {
      const targetIdentityId = decodeURIComponent(event.pathParameters.identityId);
      console.log(`Fetching user detail: ${targetIdentityId}`);

      const result = await dynamoClient.send(
        new GetItemCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId: { S: targetIdentityId } },
        })
      );

      if (!result.Item) {
        return errorResponse(404, "User not found", requestOrigin);
      }

      // Enrich linkedAccounts with identifying fields stored on each linked
      // sub-identity record (twitterHandle/twitterId, email, telegramUserId/Username).
      // The primary record may only carry the link pointer + linkedAt while the
      // actual identifier lives on the secondary's top-level attributes.
      const primary = result.Item;
      const linkedM: Record<string, any> = primary.linkedAccounts?.M ?? {};
      const subIds: string[] = [];
      for (const [, v] of Object.entries(linkedM)) {
        const id = (v as any)?.M?.identityId?.S;
        if (id && id !== targetIdentityId) subIds.push(id);
      }
      for (const subId of [...new Set(subIds)]) {
        try {
          const r = await dynamoClient.send(
            new GetItemCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: { S: subId } } })
          );
          const sec = r.Item;
          if (!sec) continue;
          if (sec.twitterHandle?.S || sec.twitterId?.S) {
            const tw: Record<string, any> = linkedM.twitter?.M ?? {};
            if (!tw.twitterHandle && sec.twitterHandle?.S) tw.twitterHandle = { S: sec.twitterHandle.S };
            if (!tw.twitterId && sec.twitterId?.S) tw.twitterId = { S: sec.twitterId.S };
            linkedM.twitter = { M: tw };
          }
          if (sec.email?.S) {
            const g: Record<string, any> = linkedM.google?.M ?? {};
            if (!g.email) g.email = { S: sec.email.S };
            linkedM.google = { M: g };
          }
          if (sec.telegramUserId?.S || sec.telegramUsername?.S) {
            const tg: Record<string, any> = linkedM.telegram?.M ?? {};
            if (!tg.telegramUserId && sec.telegramUserId?.S) tg.telegramUserId = { S: sec.telegramUserId.S };
            if (!tg.telegramUsername && sec.telegramUsername?.S) tg.telegramUsername = { S: sec.telegramUsername.S };
            linkedM.telegram = { M: tg };
          }
        } catch (_) { /* best-effort */ }
      }
      primary.linkedAccounts = { M: linkedM };

      return jsonResponse(200, { success: true, user: parseUserProfileDetail(primary) }, requestOrigin);
    }

    // GET /users - List users (paginated) OR search (?q=... present)
    if (path.endsWith("/users") && event.httpMethod === "GET") {
      // --- Search mode: q param present ---
      if (queryParams.q) {
        const rawQ = queryParams.q.trim();
        if (!rawQ) return errorResponse(400, "Missing query parameter: q", requestOrigin);
        if (rawQ.length > 128) return errorResponse(400, "Query too long (max 128 chars)", requestOrigin);

        const rawField = (queryParams.field ?? "auto").toLowerCase();
        const resolvePrimary = queryParams.resolvePrimary !== "false";

        type FieldKind = "twitter" | "google" | "telegram_id" | "telegram_username" | "wallet" | "identity_id" | "displayname";

        function inferField(input: string): FieldKind {
          if (/^0x[a-f0-9]{40,}$/i.test(input)) return "wallet";
          if (/^[a-z0-9-]+:[0-9a-f-]{36}$/i.test(input)) return "identity_id";
          if (/^\d{5,}$/.test(input)) return "telegram_id";
          if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return "google";
          return "twitter";
        }

        const fieldKind: FieldKind = (() => {
          if (rawField === "twitter") return "twitter";
          if (rawField === "google") return "google";
          if (rawField === "telegram") return /^\d+$/.test(rawQ) ? "telegram_id" : "telegram_username";
          if (rawField === "wallet") return "wallet";
          if (rawField === "identityid" || rawField === "identity_id") return "identity_id";
          if (rawField === "displayname") return "displayname";
          return inferField(rawQ);
        })();

        console.log(`User search: q="${rawQ}" field=${rawField} resolved=${fieldKind}`);

        const matchedItems: Record<string, any>[] = [];
        let truncated = false;
        // Per-page size for paginated scans. Total scan is unbounded (we follow
        // LastEvaluatedKey until exhausted) but we cap at SCAN_PAGE_BUDGET pages
        // as a circuit breaker against unexpectedly huge tables.
        const SCAN_PAGE_SIZE = 1000;
        const SCAN_PAGE_BUDGET = 200; // 200 * 1000 = up to 200k items per request

        async function paginatedScan(
          input: Omit<ConstructorParameters<typeof ScanCommand>[0], "Limit" | "ExclusiveStartKey">
        ): Promise<{ items: Record<string, any>[]; truncated: boolean }> {
          const items: Record<string, any>[] = [];
          let cursor: Record<string, any> | undefined;
          let pages = 0;
          do {
            const r = await dynamoClient.send(
              new ScanCommand({ ...input, Limit: SCAN_PAGE_SIZE, ExclusiveStartKey: cursor })
            );
            if (r.Items) items.push(...r.Items);
            cursor = r.LastEvaluatedKey;
            pages += 1;
            if (pages >= SCAN_PAGE_BUDGET) {
              return { items, truncated: !!cursor };
            }
          } while (cursor);
          return { items, truncated: false };
        }

        // Hydrate GSI projection results into full UserProfiles items via per-id GetItem.
        // GSIs on this table use KEYS_ONLY or partial INCLUDE projections (no
        // linkedToPrimaryId), so we cannot rely on GSI items for downstream logic.
        async function hydrateByIdentityIds(
          items: Record<string, any>[] | undefined
        ): Promise<Record<string, any>[]> {
          if (!items || items.length === 0) return [];
          const ids = [...new Set(items.map((i) => i.identityId?.S).filter((s): s is string => !!s))];
          const out: Record<string, any>[] = [];
          for (const id of ids) {
            try {
              const r = await dynamoClient.send(
                new GetItemCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: { S: id } } })
              );
              if (r.Item) out.push(r.Item);
            } catch (_) { /* best-effort */ }
          }
          return out;
        }

        if (fieldKind === "identity_id") {
          const result = await dynamoClient.send(
            new GetItemCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: { S: rawQ } } })
          );
          if (result.Item) matchedItems.push(result.Item);

        } else if (fieldKind === "twitter") {
          const normalized = rawQ.replace(/^@/, "").toLowerCase();
          // GSI projects subset of attributes (no linkedToPrimaryId), so we cannot use a
          // FilterExpression on linkedToPrimaryId here. Hydrate full items via GetItem
          // and let the resolvePrimary stage below handle secondary→primary mapping.
          const gsiResult = await dynamoClient.send(
            new QueryCommand({
              TableName: USER_PROFILES_TABLE,
              IndexName: "twitterHandle-index",
              KeyConditionExpression: "twitterHandle = :h",
              ExpressionAttributeValues: { ":h": { S: normalized } },
            })
          );
          const hydrated = await hydrateByIdentityIds(gsiResult.Items);
          if (hydrated.length > 0) {
            matchedItems.push(...hydrated);
          } else {
            // Fallback: scan for legacy records where twitterHandle is only in linkedAccounts
            const scanResult = await paginatedScan({
              TableName: USER_PROFILES_TABLE,
              FilterExpression: "attribute_not_exists(linkedToPrimaryId) AND #la.#tw.#th = :h",
              ExpressionAttributeNames: { "#la": "linkedAccounts", "#tw": "twitter", "#th": "twitterHandle" },
              ExpressionAttributeValues: { ":h": { S: normalized } },
            });
            matchedItems.push(...scanResult.items);
            truncated = truncated || scanResult.truncated;
          }

        } else if (fieldKind === "google") {
          const normalizedEmail = rawQ.toLowerCase();
          let gsiSuccess = false;
          try {
            const gsiResult = await dynamoClient.send(
              new QueryCommand({
                TableName: USER_PROFILES_TABLE,
                IndexName: "email-index",
                KeyConditionExpression: "#em = :e",
                ExpressionAttributeNames: { "#em": "email" },
                ExpressionAttributeValues: { ":e": { S: normalizedEmail } },
              })
            );
            const hydrated = await hydrateByIdentityIds(gsiResult.Items);
            matchedItems.push(...hydrated);
            gsiSuccess = true;
          } catch (err: any) {
            if (err?.name !== "ResourceNotFoundException" && err?.name !== "ValidationException") throw err;
          }
          if (!gsiSuccess) {
            const scanResult = await paginatedScan({
              TableName: USER_PROFILES_TABLE,
              FilterExpression: "attribute_not_exists(linkedToPrimaryId) AND (#em = :e OR #la.#g.#em2 = :e)",
              ExpressionAttributeNames: { "#em": "email", "#la": "linkedAccounts", "#g": "google", "#em2": "email" },
              ExpressionAttributeValues: { ":e": { S: normalizedEmail } },
            });
            matchedItems.push(...scanResult.items);
            truncated = truncated || scanResult.truncated;
          }

        } else if (fieldKind === "telegram_id") {
          const gsiResult = await dynamoClient.send(
            new QueryCommand({
              TableName: USER_PROFILES_TABLE,
              IndexName: "telegramUserId-index",
              KeyConditionExpression: "telegramUserId = :id",
              ExpressionAttributeValues: { ":id": { S: rawQ } },
            })
          );
          const hydrated = await hydrateByIdentityIds(gsiResult.Items);
          matchedItems.push(...hydrated);

        } else if (fieldKind === "telegram_username") {
          const normalized = rawQ.replace(/^@/, "").toLowerCase();
          const scanResult = await paginatedScan({
            TableName: USER_PROFILES_TABLE,
            FilterExpression: "attribute_not_exists(linkedToPrimaryId) AND telegramUsername = :u",
            ExpressionAttributeValues: { ":u": { S: normalized } },
          });
          matchedItems.push(...scanResult.items);
          truncated = truncated || scanResult.truncated;

        } else if (fieldKind === "wallet") {
          const normalizedWallet = rawQ.toLowerCase();
          let gsiSuccess = false;
          try {
            const gsiResult = await dynamoClient.send(
              new QueryCommand({
                TableName: USER_PROFILES_TABLE,
                IndexName: "walletAddress-index",
                KeyConditionExpression: "walletAddress = :w",
                ExpressionAttributeValues: { ":w": { S: normalizedWallet } },
              })
            );
            const hydrated = await hydrateByIdentityIds(gsiResult.Items);
            matchedItems.push(...hydrated);
            gsiSuccess = true;
          } catch (err: any) {
            if (err?.name !== "ResourceNotFoundException" && err?.name !== "ValidationException") throw err;
          }
          if (!gsiSuccess) {
            const scanResult = await paginatedScan({
              TableName: USER_PROFILES_TABLE,
              FilterExpression:
                "attribute_not_exists(linkedToPrimaryId) AND (walletAddress = :w OR #la.metamask.#wa = :w OR #la.#nw.#wa = :w)",
              ExpressionAttributeNames: { "#la": "linkedAccounts", "#wa": "walletAddress", "#nw": "nasun wallet" },
              ExpressionAttributeValues: { ":w": { S: normalizedWallet } },
            });
            matchedItems.push(...scanResult.items);
            truncated = truncated || scanResult.truncated;
          }

        } else if (fieldKind === "displayname") {
          const scanResult = await paginatedScan({
            TableName: USER_PROFILES_TABLE,
            FilterExpression: "attribute_not_exists(linkedToPrimaryId) AND contains(customDisplayName, :q)",
            ExpressionAttributeValues: { ":q": { S: rawQ } },
          });
          matchedItems.push(...scanResult.items);
          truncated = truncated || scanResult.truncated;
        }

        // Resolve secondary accounts to their primary
        let resolvedItems = matchedItems;
        if (resolvePrimary && matchedItems.length > 0) {
          const primaryById = new Map<string, Record<string, any>>();
          // primaryId -> list of secondary records that resolved to it. Used
          // below to enrich the primary with attributes the admin actually
          // searched on (e.g. twitterHandle stored only on the secondary).
          const secondariesByPrimary = new Map<string, Record<string, any>[]>();
          const secondaryItems: Record<string, any>[] = [];

          for (const item of matchedItems) {
            if (item.linkedToPrimaryId?.S) secondaryItems.push(item);
            else {
              const id = item.identityId?.S ?? "";
              if (id) primaryById.set(id, item);
            }
          }
          for (const sec of secondaryItems) {
            const pid = sec.linkedToPrimaryId?.S;
            if (!pid) continue;
            const list = secondariesByPrimary.get(pid) ?? [];
            list.push(sec);
            secondariesByPrimary.set(pid, list);
          }
          for (const pid of secondariesByPrimary.keys()) {
            if (primaryById.has(pid)) continue;
            try {
              const r = await dynamoClient.send(
                new GetItemCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: { S: pid } } })
              );
              if (r.Item) primaryById.set(pid, r.Item);
            } catch (_) { /* best-effort */ }
          }

          // Enrich each primary's linkedAccounts with attributes from any
          // matched secondary (without overwriting existing values). This
          // ensures the admin UI shows the identifier they searched on.
          for (const [pid, primary] of primaryById) {
            const secondaries = secondariesByPrimary.get(pid);
            if (!secondaries || secondaries.length === 0) continue;
            const linkedM: Record<string, any> = primary.linkedAccounts?.M ?? {};
            for (const sec of secondaries) {
              if (sec.twitterHandle?.S || sec.twitterId?.S) {
                const tw: Record<string, any> = linkedM.twitter?.M ?? {};
                if (!tw.twitterHandle && sec.twitterHandle?.S) tw.twitterHandle = { S: sec.twitterHandle.S };
                if (!tw.twitterId && sec.twitterId?.S) tw.twitterId = { S: sec.twitterId.S };
                linkedM.twitter = { M: tw };
              }
              if (sec.email?.S) {
                const g: Record<string, any> = linkedM.google?.M ?? {};
                if (!g.email) g.email = { S: sec.email.S };
                linkedM.google = { M: g };
              }
              if (sec.telegramUserId?.S || sec.telegramUsername?.S) {
                const tg: Record<string, any> = linkedM.telegram?.M ?? {};
                if (!tg.telegramUserId && sec.telegramUserId?.S) tg.telegramUserId = { S: sec.telegramUserId.S };
                if (!tg.telegramUsername && sec.telegramUsername?.S) tg.telegramUsername = { S: sec.telegramUsername.S };
                linkedM.telegram = { M: tg };
              }
            }
            primary.linkedAccounts = { M: linkedM };
          }

          resolvedItems = [...primaryById.values()];
        }

        return jsonResponse(200, {
          success: true,
          query: { q: rawQ, field: fieldKind, resolvePrimary },
          matches: resolvedItems.map(parseUserProfileDetail),
          truncated,
        }, requestOrigin);
      }

      // --- List mode: no q param ---
      const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit || "50", 10) || 50));
      const nextToken = queryParams.nextToken;

      console.log(`Listing users (limit: ${limit}, nextToken: ${!!nextToken})`);

      const scanParams: any = {
        TableName: USER_PROFILES_TABLE,
        Limit: limit,
        FilterExpression: "attribute_not_exists(linkedToPrimaryId)",
      };

      if (nextToken) {
        try {
          scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64").toString("utf-8"));
        } catch (err) {
          return errorResponse(400, "Invalid nextToken", requestOrigin);
        }
      }

      const result = await dynamoClient.send(new ScanCommand(scanParams));
      const users = (result.Items || []).map(parseUserProfileItem).map(toListItem);

      let encodedNextToken: string | undefined;
      if (result.LastEvaluatedKey) {
        encodedNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString("base64");
      }

      return jsonResponse(200, {
        success: true,
        users,
        nextToken: encodedNextToken,
      }, requestOrigin);
    }

    // GET /devnet-metrics - Devnet daily metrics (admin only)
    if (path.endsWith("/devnet-metrics") && event.httpMethod === "GET") {
      console.log("Fetching devnet metrics");

      const metrics: Array<{
        date: string;
        dau: number;
        newAddresses: number;
        cumulativeAddresses: number;
        transactionCount?: number;
        collectedAt: string;
      }> = [];
      let lastEvaluatedKey: Record<string, any> | undefined;

      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: DEVNET_METRICS_TABLE,
            FilterExpression: "begins_with(pk, :prefix)",
            ExpressionAttributeValues: { ":prefix": { S: "METRICS#" } },
            ProjectionExpression: "pk, dau, newAddresses, cumulativeAddresses, transactionCount, collectedAt",
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        if (result.Items) {
          for (const item of result.Items) {
            const pk = item.pk?.S || "";
            metrics.push({
              date: pk.replace("METRICS#", ""),
              dau: Number(item.dau?.N) || 0,
              newAddresses: Number(item.newAddresses?.N) || 0,
              cumulativeAddresses: Number(item.cumulativeAddresses?.N) || 0,
              transactionCount: item.transactionCount?.N != null ? Number(item.transactionCount.N) : undefined,
              collectedAt: item.collectedAt?.S || "",
            });
          }
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Sort by date ascending
      metrics.sort((a, b) => a.date.localeCompare(b.date));

      return jsonResponse(200, { metrics }, requestOrigin);
    }

    // GET /nasun-stats/download?format=csv|txt|meta
    //   csv  → text/csv blob
    //   txt  → text/plain blob
    //   meta → JSON { ready, generatedAt, reportBaseDate, rowCount }
    if (path.endsWith("/nasun-stats/download") && event.httpMethod === "GET") {
      const rawFormat = event.queryStringParameters?.format;
      const format = rawFormat === "txt" ? "txt" : rawFormat === "meta" ? "meta" : "csv";

      const projection = format === "meta"
        ? "generatedAt, reportBaseDate, rowCount"
        : "csv, txt, reportBaseDate";

      const result = await dynamoClient.send(
        new GetItemCommand({
          TableName: DEVNET_METRICS_TABLE,
          Key: { pk: { S: "NASUN_STATS_DOWNLOAD" }, sk: { S: "LATEST" } },
          ProjectionExpression: projection,
        })
      );

      if (format === "meta") {
        if (!result.Item) {
          return jsonResponse(200, { ready: false }, requestOrigin);
        }
        return jsonResponse(200, {
          ready: true,
          generatedAt: result.Item.generatedAt?.S || "",
          reportBaseDate: result.Item.reportBaseDate?.S || "",
          rowCount: Number(result.Item.rowCount?.N) || 0,
        }, requestOrigin);
      }

      if (!result.Item) {
        return errorResponse(404, "Nasun stats snapshot not generated yet", requestOrigin);
      }

      // Strict-validate reportBaseDate before embedding in Content-Disposition
      // to prevent CRLF / header injection. Collector writes ISO YYYY-MM-DD,
      // but defend against a corrupted snapshot item.
      const rawReportDate = result.Item.reportBaseDate?.S;
      const reportDate =
        rawReportDate && /^\d{4}-\d{2}-\d{2}$/.test(rawReportDate)
          ? rawReportDate
          : "unknown";
      const content = format === "csv"
        ? (result.Item.csv?.S || "")
        : (result.Item.txt?.S || "");
      const filename = `nasun-stats-${reportDate}.${format}`;
      const contentType = format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8";

      return {
        statusCode: 200,
        headers: {
          ...corsHeaders(requestOrigin),
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
        body: content,
      };
    }

    // ==================== Genesis Pass Allowlist CRUD ====================

    const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

    // GET /genesis-pass/entries - List all allowlist entries
    if (path.endsWith("/genesis-pass/entries") && event.httpMethod === "GET") {
      console.log("Fetching Genesis Pass allowlist entries");
      const items = await scanGenesisPassAllowlist("ALL");

      // Enrich twitterHandle from UserProfiles for entries missing it
      try {
        const handleMap = await scanTwitterHandleMap();
        for (const item of items) {
          if (!item.twitterHandle && item.identityId) {
            item.twitterHandle = handleMap.get(item.identityId);
          }
        }
      } catch (err) {
        console.warn("[entries] Failed to enrich twitterHandle:", err);
      }

      items.sort((a, b) => (b.registeredAt || "").localeCompare(a.registeredAt || ""));
      return jsonResponse(200, { success: true, items }, requestOrigin);
    }

    // POST /genesis-pass/entries - Add a new entry
    if (path.endsWith("/genesis-pass/entries") && event.httpMethod === "POST") {
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON in request body", requestOrigin);
      }

      const { walletAddress, mintType, source } = body as {
        walletAddress?: string;
        mintType?: string;
        source?: string;
      };

      if (!walletAddress || typeof walletAddress !== "string") {
        return errorResponse(400, "Missing required field: walletAddress", requestOrigin);
      }
      if (!EVM_ADDRESS_REGEX.test(walletAddress)) {
        return errorResponse(400, "Invalid EVM wallet address format", requestOrigin);
      }

      const normalizedAddress = walletAddress.toLowerCase();

      // Check for duplicate
      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: GENESIS_PASS_TABLE,
          Key: { walletAddress: { S: normalizedAddress } },
        })
      );
      if (existing.Item) {
        return errorResponse(409, "Wallet address already registered", requestOrigin);
      }

      const item: Record<string, { S: string }> = {
        walletAddress: { S: normalizedAddress },
        registeredAt: { S: new Date().toISOString() },
        status: { S: "ACTIVE" },
      };
      if (mintType && typeof mintType === "string") item.mintType = { S: mintType };
      if (source && typeof source === "string") item.source = { S: source };

      await dynamoClient.send(
        new PutItemCommand({ TableName: GENESIS_PASS_TABLE, Item: item })
      );

      console.log(`[genesis-pass-crud] Added: ${normalizedAddress} (mintType: ${mintType || "none"})`);
      return jsonResponse(201, { success: true, walletAddress: normalizedAddress }, requestOrigin);
    }

    // PUT /genesis-pass/entries/{walletAddress} - Update status/mintType/source
    if (path.includes("/genesis-pass/entries/") && event.httpMethod === "PUT") {
      const walletAddress = event.pathParameters?.walletAddress;
      if (!walletAddress) {
        return errorResponse(400, "Missing walletAddress in path", requestOrigin);
      }

      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON in request body", requestOrigin);
      }

      const normalizedAddress = decodeURIComponent(walletAddress).toLowerCase();

      // Verify entry exists
      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: GENESIS_PASS_TABLE,
          Key: { walletAddress: { S: normalizedAddress } },
        })
      );
      if (!existing.Item) {
        return errorResponse(404, "Entry not found", requestOrigin);
      }

      const VALID_STATUS_VALUES = ["ACTIVE", "APPLIED", "LEGACY", "WITHDRAWN"];
      const updates: string[] = [];
      const names: Record<string, string> = {};
      const values: Record<string, { S: string }> = {};

      if (body.status !== undefined) {
        const newStatus = String(body.status);
        if (!VALID_STATUS_VALUES.includes(newStatus)) {
          return errorResponse(400, `Invalid status: ${newStatus}. Must be one of: ${VALID_STATUS_VALUES.join(", ")}`, requestOrigin);
        }
        updates.push("#s = :s");
        names["#s"] = "status";
        values[":s"] = { S: newStatus };
      }
      if (body.mintType !== undefined) {
        updates.push("mintType = :mt");
        values[":mt"] = { S: String(body.mintType) };
      }
      if (body.source !== undefined) {
        updates.push("#src = :src");
        names["#src"] = "source";
        values[":src"] = { S: String(body.source) };
      }

      if (updates.length === 0) {
        return errorResponse(400, "No fields to update. Provide status, mintType, or source.", requestOrigin);
      }

      // Audit fields
      updates.push("lastModifiedBy = :adminId", "lastModifiedAt = :modifiedAt");
      values[":adminId"] = { S: admin.identityId };
      values[":modifiedAt"] = { S: new Date().toISOString() };

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: GENESIS_PASS_TABLE,
          Key: { walletAddress: { S: normalizedAddress } },
          UpdateExpression: `SET ${updates.join(", ")}`,
          ...(Object.keys(names).length > 0 && { ExpressionAttributeNames: names }),
          ExpressionAttributeValues: values,
        })
      );

      console.log(`[genesis-pass-crud] Updated by ${admin.email}: ${normalizedAddress} (fields: ${Object.keys(body).join(", ")})`);
      return jsonResponse(200, { success: true, walletAddress: normalizedAddress }, requestOrigin);
    }

    // DELETE /genesis-pass/entries/{walletAddress} - Remove an entry
    if (path.includes("/genesis-pass/entries/") && event.httpMethod === "DELETE") {
      const walletAddress = event.pathParameters?.walletAddress;
      if (!walletAddress) {
        return errorResponse(400, "Missing walletAddress in path", requestOrigin);
      }

      const normalizedAddress = decodeURIComponent(walletAddress).toLowerCase();

      await dynamoClient.send(
        new DeleteItemCommand({
          TableName: GENESIS_PASS_TABLE,
          Key: { walletAddress: { S: normalizedAddress } },
        })
      );

      console.log(`[genesis-pass-crud] Deleted: ${normalizedAddress}`);
      return jsonResponse(200, { success: true, walletAddress: normalizedAddress }, requestOrigin);
    }

    // ==================== Admin: Referral Review ====================
    // GET /admin/referral-review?cursor=<base64>&limit=<n>
    // Returns PENDING referrals with referee + referrer twitterHandle for manual review.
    if (path.endsWith("/admin/referral-review") && event.httpMethod === "GET") {
      const cursorParam = queryParams.cursor as string | undefined;
      let limit = parseInt(queryParams.limit || "20", 10);
      if (!Number.isFinite(limit) || limit <= 0) limit = 20;
      if (limit > 100) limit = 100;

      let exclusiveStartKey: Record<string, any> | undefined;
      if (cursorParam) {
        try {
          const parsed = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf-8"));
          if (parsed?.v !== 1 || typeof parsed.key !== "object") {
            return errorResponse(400, "Invalid cursor", requestOrigin);
          }
          exclusiveStartKey = parsed.key;
        } catch {
          return errorResponse(400, "Invalid cursor", requestOrigin);
        }
      }

      // No `Limit` cap on the underlying Scan: Limit applies to *raw* rows
      // before FilterExpression, so a `Limit: limit*4` slice could leave
      // PENDING rows stranded (LastEvaluatedKey advances past them and
      // subsequent pages never see them). Loop until we have `limit` matches
      // or DDB exhausts the table. Devnet PENDING count is bounded by
      // MAX_REFERRALS_PER_USER (100) per referrer, so total stays in the
      // hundreds — single Scan pass typically suffices.
      const rawItems: Array<Record<string, any>> = [];
      let scanCursor: Record<string, any> | undefined = exclusiveStartKey;
      let lastReturnedCursor: Record<string, any> | undefined;
      do {
        const r = await dynamoClient.send(
          new ScanCommand({
            TableName: REFERRALS_TABLE,
            FilterExpression: "#s = :pending",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":pending": { S: "PENDING" } },
            ...(scanCursor && { ExclusiveStartKey: scanCursor }),
          })
        );
        for (const it of r.Items || []) {
          if (rawItems.length >= limit) break;
          rawItems.push(it);
        }
        lastReturnedCursor = r.LastEvaluatedKey;
        scanCursor = r.LastEvaluatedKey;
      } while (rawItems.length < limit && scanCursor);
      const scanResult = { LastEvaluatedKey: lastReturnedCursor };
      const refereeIds = rawItems.map((i) => i.referredIdentityId?.S).filter(Boolean) as string[];
      const referrerIds = [...new Set(rawItems.map((i) => i.referrerIdentityId?.S).filter(Boolean))] as string[];

      // Parallel UserProfiles lookups for both sides (max 2*limit calls, limit<=100)
      const profileMap = new Map<string, { twitterHandle?: string; twitterId?: string }>();
      await Promise.all(
        [...new Set([...refereeIds, ...referrerIds])].map(async (id) => {
          try {
            const res = await dynamoClient.send(
              new GetItemCommand({
                TableName: USER_PROFILES_TABLE,
                Key: { identityId: { S: id } },
                ProjectionExpression: "twitterHandle, twitterId",
              })
            );
            if (res.Item) {
              profileMap.set(id, {
                twitterHandle: res.Item.twitterHandle?.S,
                twitterId: res.Item.twitterId?.S,
              });
            }
          } catch {
            // ignore individual lookup failures
          }
        })
      );

      const items = rawItems.map((it) => {
        const refId = it.referredIdentityId?.S || "";
        const rerId = it.referrerIdentityId?.S || "";
        const refProfile = profileMap.get(refId) || {};
        const rerProfile = profileMap.get(rerId) || {};
        return {
          referredIdentityId: refId,
          referrerIdentityId: rerId,
          twitterHandle: refProfile.twitterHandle || null,
          twitterLinked: Boolean(refProfile.twitterId),
          referrerHandle: rerProfile.twitterHandle || null,
          referralCode: it.referralCode?.S || null,
          appliedAt: it.appliedAt?.S || null,
        };
      });

      const nextCursor = scanResult.LastEvaluatedKey
        ? Buffer.from(JSON.stringify({ v: 1, key: scanResult.LastEvaluatedKey })).toString("base64")
        : null;

      return jsonResponse(200, { items, nextCursor }, requestOrigin);
    }

    // POST /admin/referral-review/approve  body: { identityId }
    if (path.endsWith("/admin/referral-review/approve") && event.httpMethod === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const referredId = body.identityId as string | undefined;
      if (!referredId || typeof referredId !== "string") {
        return errorResponse(400, "identityId is required", requestOrigin);
      }

      const now = new Date().toISOString();
      try {
        await dynamoClient.send(
          new UpdateItemCommand({
            TableName: REFERRALS_TABLE,
            Key: { referredIdentityId: { S: referredId } },
            UpdateExpression:
              "SET #s = :activated, activatedAt = :now, reviewedAt = :now, reviewerIdentityId = :admin",
            ConditionExpression: "attribute_exists(referredIdentityId) AND #s = :pending",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: {
              ":activated": { S: "ACTIVATED" },
              ":pending": { S: "PENDING" },
              ":now": { S: now },
              ":admin": { S: admin.identityId },
            },
          })
        );
      } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
          return errorResponse(409, "Already reviewed or referral missing", requestOrigin);
        }
        throw err;
      }

      console.log(JSON.stringify({
        event: "referral_approved",
        referredIdentityId: referredId,
        reviewerIdentityId: admin.identityId,
        ts: now,
      }));

      // Onboarding bonus backfill: now that the referral is ACTIVATED, grant
      // any social bonuses the referee already earned (follow-nasun + x-link +
      // google-link + telegram-link). PG UNIQUE dedupes against future live
      // triggers, so this is safe to run unconditionally. Non-blocking: a grant
      // failure must not fail the approve response.
      if (process.env.EXPLORER_API_URL) {
        try {
          const profileRes = await dynamoClient.send(
            new GetItemCommand({
              TableName: USER_PROFILES_TABLE,
              Key: { identityId: { S: referredId } },
            }),
          );
          const item = profileRes.Item;
          if (item) {
            const twitterId = item.twitterId?.S;
            const telegramUserId = item.telegramUserId?.S;
            // For Google-as-secondary the externalId lives in linkedAccounts.google.
            // For Google-as-primary the user IS the Google federated identity, so
            // referredId itself is the Cognito identityId tied to that Google sub.
            const googleSecondaryId = item.linkedAccounts?.M?.google?.M?.identityId?.S;
            const provider = item.provider?.S?.toLowerCase();
            const googleExternalId = googleSecondaryId
              || (provider === "google" ? referredId : undefined);
            const walletAddress = item.walletAddress?.S ?? null;

            const docClient = DynamoDBDocumentClient.from(dynamoClient);
            const common = {
              ddbClient: docClient,
              referralsTable: process.env.REFERRALS_TABLE || "nasun-referrals",
              explorerApiUrl: process.env.EXPLORER_API_URL,
              apiKey: process.env.ONBOARDING_BONUS_API_KEY || "",
              identityId: referredId,
              walletAddress,
            };
            const tasks: Promise<unknown>[] = [];
            if (twitterId) {
              tasks.push(
                grantIfReferralActivated({ ...common, kind: "follow-nasun", externalId: twitterId }),
                grantIfReferralActivated({ ...common, kind: "x-link", externalId: twitterId }),
              );
            } else {
              console.warn("[onboarding-bonus] approve: no twitterId, skipping follow+x", { referredId });
            }
            if (googleExternalId) {
              tasks.push(grantIfReferralActivated({ ...common, kind: "google-link", externalId: googleExternalId }));
            }
            if (telegramUserId) {
              tasks.push(grantIfReferralActivated({ ...common, kind: "telegram-link", externalId: telegramUserId }));
            }
            const settled = await Promise.allSettled(tasks);
            const rejected = settled.filter((r) => r.status === "rejected");
            if (rejected.length > 0) {
              console.warn("[onboarding-bonus] approve: partial backfill failures", {
                referredId,
                rejectedCount: rejected.length,
              });
            }
          }
        } catch (err) {
          console.warn("[onboarding-bonus] approve backfill failed (non-fatal)", err);
        }
      }

      return jsonResponse(200, { activated: 1, identityId: referredId }, requestOrigin);
    }

    // POST /admin/referral-review/decline  body: { identityId, reviewerNote }
    if (path.endsWith("/admin/referral-review/decline") && event.httpMethod === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const referredId = body.identityId as string | undefined;
      const reviewerNote = (body.reviewerNote as string | undefined) || "";
      if (!referredId || typeof referredId !== "string") {
        return errorResponse(400, "identityId is required", requestOrigin);
      }

      // Look up referrer first (for audit log) before deleting.
      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: REFERRALS_TABLE,
          Key: { referredIdentityId: { S: referredId } },
          ProjectionExpression: "referrerIdentityId, referralCode, #s",
          ExpressionAttributeNames: { "#s": "status" },
        })
      );

      if (!existing.Item || existing.Item.status?.S !== "PENDING") {
        return errorResponse(409, "Already reviewed or referral missing", requestOrigin);
      }

      const now = new Date().toISOString();
      try {
        await dynamoClient.send(
          new DeleteItemCommand({
            TableName: REFERRALS_TABLE,
            Key: { referredIdentityId: { S: referredId } },
            ConditionExpression: "attribute_exists(referredIdentityId) AND #s = :pending",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":pending": { S: "PENDING" } },
          })
        );
      } catch (err: any) {
        if (err.name === "ConditionalCheckFailedException") {
          return errorResponse(409, "Already reviewed or referral missing", requestOrigin);
        }
        throw err;
      }

      // Set 30-day cooldown tombstone on the declined user.
      try {
        await dynamoClient.send(
          new UpdateItemCommand({
            TableName: USER_PROFILES_TABLE,
            Key: { identityId: { S: referredId } },
            UpdateExpression: "SET lastReferralDeclinedAt = :now",
            ExpressionAttributeValues: { ":now": { S: now } },
          })
        );
      } catch (err: any) {
        // Non-fatal: row delete already succeeded; cooldown is best-effort.
        console.error("[referral-review] Failed to set cooldown tombstone:", err.message);
      }

      console.log(JSON.stringify({
        event: "referral_declined",
        referredIdentityId: referredId,
        referrerIdentityId: existing.Item.referrerIdentityId?.S || null,
        referralCode: existing.Item.referralCode?.S || null,
        reviewerNote,
        reviewerIdentityId: admin.identityId,
        ts: now,
      }));
      return jsonResponse(200, { declined: 1, identityId: referredId }, requestOrigin);
    }

    return errorResponse(404, "Not found", requestOrigin);
  } catch (error: unknown) {
    console.error("Admin Export API error:", error instanceof Error ? error.message : String(error));
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
