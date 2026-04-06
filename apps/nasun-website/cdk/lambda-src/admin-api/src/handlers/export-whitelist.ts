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

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Table names
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

const MAX_SCAN_PAGES = 20;

/**
 * Scan all user profiles from DynamoDB into memory
 */
async function scanAllUserProfiles(): Promise<UserProfileItem[]> {
  const items: UserProfileItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;
  let pageCount = 0;

  do {
    const command = new ScanCommand({
      TableName: USER_PROFILES_TABLE,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const result = await dynamoClient.send(command);
    pageCount++;

    if (result.Items) {
      for (const item of result.Items) {
        items.push(parseUserProfileItem(item));
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey && pageCount < MAX_SCAN_PAGES);

  return items;
}

/**
 * Filter and paginate user profiles in memory
 */
function filterAndPaginateUsers(
  users: UserProfileItem[],
  params: { search?: string; provider?: string; page: number; limit: number }
): { users: Omit<UserProfileItem, "linkedAccounts">[]; total: number; page: number; limit: number; totalPages: number } {
  let filtered = users;

  // Filter by connection status
  if (params.provider) {
    switch (params.provider) {
      case "x_connected":
        filtered = filtered.filter((u) => !!u.twitterHandle);
        break;
      case "google_connected":
        filtered = filtered.filter((u) => !!u.googleEmail);
        break;
      case "tg_connected":
        filtered = filtered.filter((u) => u.isTelegramMember === true);
        break;
      case "no_connections":
        filtered = filtered.filter((u) => u.linkedProviders.length === 0);
        break;
      // Ignore unrecognized values (safe fallback: show all)
    }
  }

  // Filter by search term (case-insensitive)
  if (params.search) {
    const searchLower = params.search.toLowerCase();
    filtered = filtered.filter((u) =>
      (u.username?.toLowerCase().includes(searchLower)) ||
      (u.email?.toLowerCase().includes(searchLower)) ||
      (u.twitterHandle?.toLowerCase().includes(searchLower)) ||
      (u.originalTwitterHandle?.toLowerCase().includes(searchLower)) ||
      (u.walletAddress?.toLowerCase().includes(searchLower)) ||
      (u.googleEmail?.toLowerCase().includes(searchLower))
    );
  }

  // Sort by createdAt descending (newest first)
  filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / params.limit));
  const page = Math.min(params.page, totalPages);
  const offset = (page - 1) * params.limit;
  const paged = filtered.slice(offset, offset + params.limit);

  return {
    users: paged.map(toListItem),
    total,
    page,
    limit: params.limit,
    totalPages,
  };
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
  let pageCount = 0;

  do {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: USER_PROFILES_TABLE,
      ProjectionExpression: "identityId, twitterHandle",
      ExclusiveStartKey: lastEvaluatedKey,
    }));
    pageCount++;

    if (result.Items) {
      for (const item of result.Items) {
        const id = item.identityId?.S;
        const handle = item.twitterHandle?.S;
        if (id && handle) handleMap.set(id, handle);
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey && pageCount < MAX_SCAN_PAGES);

  if (lastEvaluatedKey) {
    console.warn(`[scanTwitterHandleMap] Truncated at ${MAX_SCAN_PAGES} pages, some handles may be missing`);
  }

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

      // Scan Genesis Pass allowlist for active holders
      const genesisPass: string[] = [];
      let gpLastKey: Record<string, any> | undefined;
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: GENESIS_PASS_TABLE,
            FilterExpression: "#s = :active",
            ExpressionAttributeNames: { "#s": "status" },
            ExpressionAttributeValues: { ":active": { S: "ACTIVE" } },
            ProjectionExpression: "identityId",
            ...(gpLastKey && { ExclusiveStartKey: gpLastKey }),
          })
        );
        for (const item of result.Items || []) {
          const id = item.identityId?.S;
          if (id) genesisPass.push(id);
        }
        gpLastKey = result.LastEvaluatedKey;
      } while (gpLastKey);

      console.log(`[internal] Wallet mappings: ${Object.keys(wallets).length} wallets, ${genesisPass.length} genesis pass holders`);
      return jsonResponse(200, { wallets, genesisPass }, requestOrigin);
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
      // Expiry: 180 days from appliedAt. Legacy records without appliedAt are treated as non-expired.
      const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const referrals: Record<string, string> = {};
      let totalRelationships = 0;
      let totalActivated = 0;
      let totalExpired = 0;
      let refLastKey: Record<string, any> | undefined;
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: REFERRALS_TABLE,
            ProjectionExpression: "referredIdentityId, referrerIdentityId, #s, appliedAt",
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
              // Filter expired referrals (legacy records without appliedAt are never expired)
              const appliedAt = item.appliedAt?.S;
              if (appliedAt) {
                const appliedMs = Date.parse(appliedAt);
                if (!isNaN(appliedMs) && now - appliedMs > EXPIRY_MS) {
                  totalExpired++;
                  continue;
                }
              }
              referrals[referredId] = referrerId;
              totalActivated++;
            }
          }
        }
        refLastKey = result.LastEvaluatedKey;
      } while (refLastKey);

      console.log(`[internal] Referral mappings: ${totalRelationships} total, ${totalActivated} activated (returned), ${totalExpired} expired (filtered)`);
      return jsonResponse(200, {
        referrals,
        stats: { totalRelationships, totalActivated },
      }, requestOrigin);
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

      console.log(`[internal] Ecosystem activations: ${totalActive} active across ${Object.keys(activations).length} users`);
      return jsonResponse(200, { activations }, requestOrigin);
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

      return jsonResponse(200, { success: true, user: parseUserProfileDetail(result.Item) }, requestOrigin);
    }

    // GET /users - List users with search, filter, pagination
    if (path.endsWith("/users") && event.httpMethod === "GET") {
      const page = Math.max(1, parseInt(queryParams.page || "1", 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit || "50", 10) || 50));
      const search = queryParams.search?.trim();
      const provider = queryParams.provider?.trim();

      console.log(`Listing users (page: ${page}, limit: ${limit}, search: ${search || "none"}, provider: ${provider || "all"})`);

      const allUsers = await scanAllUserProfiles();
      // Filter out secondary profiles (linked to a primary)
      const primaryUsers = allUsers.filter(u => !u.linkedToPrimaryId);
      const result = filterAndPaginateUsers(primaryUsers, { search, provider, page, limit });

      const telegramCount = primaryUsers.filter(u => u.isTelegramMember === true).length;
      const xConnectedCount = primaryUsers.filter(u => !!u.twitterHandle).length;
      const botCount = primaryUsers.filter(u => u.probableBot).length;

      return jsonResponse(200, {
        success: true,
        ...result,
        stats: {
          totalRegistered: primaryUsers.length,
          totalRegisteredExBot: primaryUsers.length - botCount,
          botCount,
          telegramMembers: telegramCount,
          xConnected: xConnectedCount,
        },
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

    // GET /user-analytics - User analytics daily metrics (admin only)
    if (path.endsWith("/user-analytics") && event.httpMethod === "GET") {
      console.log("Fetching user analytics metrics");

      const metrics: Array<{
        date: string;
        registeredUsers: number;
        leaderboardAccounts: number;
        telegramMembers: number;
        xConnected: number;
      }> = [];
      let lastEvaluatedKey: Record<string, any> | undefined;

      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: DEVNET_METRICS_TABLE,
            FilterExpression: "begins_with(pk, :prefix)",
            ExpressionAttributeValues: { ":prefix": { S: "USER_METRICS#" } },
            ProjectionExpression: "pk, registeredUsers, leaderboardAccounts, telegramMembers, xConnected",
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );

        if (result.Items) {
          for (const item of result.Items) {
            const pk = item.pk?.S || "";
            metrics.push({
              date: pk.replace("USER_METRICS#", ""),
              registeredUsers: Number(item.registeredUsers?.N) || 0,
              leaderboardAccounts: Number(item.leaderboardAccounts?.N) || 0,
              telegramMembers: Number(item.telegramMembers?.N) || 0,
              xConnected: Number(item.xConnected?.N) || 0,
            });
          }
        }

        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      // Sort by date ascending
      metrics.sort((a, b) => a.date.localeCompare(b.date));

      return jsonResponse(200, { metrics }, requestOrigin);
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

    return errorResponse(404, "Not found", requestOrigin);
  } catch (error: unknown) {
    console.error("Admin Export API error:", error instanceof Error ? error.message : String(error));
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
