import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
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
  "googleEmail", "linkedProviders",
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
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
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
    const VALID_STATUSES = ["ACTIVE", "WITHDRAWN", "ALL"];

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

      console.log(`Exporting Genesis Pass allowlist (status: ${status}, format: ${format || "default"})`);
      const items = await scanGenesisPassAllowlist(status);

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
        filename = generateFilename("genesis-pass-opensea-allowlist", status.toLowerCase());
      } else {
        csv = generateCSV(items, [
          { key: "walletAddress", header: "walletAddress" },
          { key: "identityId", header: "identityId" },
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

      return jsonResponse(200, {
        success: true,
        ...result,
        stats: {
          totalRegistered: primaryUsers.length,
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

    // PUT /genesis-pass/entries/{walletAddress} - Update mintType/source
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

      const updates: string[] = [];
      const names: Record<string, string> = {};
      const values: Record<string, { S: string }> = {};

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
        return errorResponse(400, "No fields to update. Provide mintType or source.", requestOrigin);
      }

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: GENESIS_PASS_TABLE,
          Key: { walletAddress: { S: normalizedAddress } },
          UpdateExpression: `SET ${updates.join(", ")}`,
          ...(Object.keys(names).length > 0 && { ExpressionAttributeNames: names }),
          ExpressionAttributeValues: values,
        })
      );

      console.log(`[genesis-pass-crud] Updated: ${normalizedAddress}`);
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
