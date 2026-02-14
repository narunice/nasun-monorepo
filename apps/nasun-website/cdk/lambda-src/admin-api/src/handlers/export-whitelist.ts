import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import {
  DynamoDBClient,
  ScanCommand,
  QueryCommand,
  PutItemCommand,
  DeleteItemCommand,
} from "@aws-sdk/client-dynamodb";
import { verifyAdminRole, extractIdentityIdFromAuthorizer, verifyTokenManually } from "../utils/auth.js";
import { generateCSV, generateFilename } from "../utils/csv.js";
import { corsHeaders, csvResponse, jsonResponse, errorResponse, unauthorizedResponse } from "../utils/response.js";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Table names
const GENESIS_TABLE = process.env.GENESIS_TABLE || "GenesisNftWhitelist";
const BATTALION_TABLE = process.env.BATTALION_TABLE || "nasun-nft-whitelist";
const HIDDEN_PROPOSALS_TABLE = process.env.HIDDEN_PROPOSALS_TABLE || "HiddenProposals";

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
        filename = generateFilename("genesis-nft-opensea-allowlist", status.toLowerCase());
      } else {
        // Default format
        csv = generateCSV(items, [
          { key: "walletAddress", header: "walletAddress" },
          { key: "joinedAt", header: "joinedAt" },
          { key: "signature", header: "signature" },
          { key: "status", header: "status" },
          { key: "withdrawnAt", header: "withdrawnAt" },
        ]);
        filename = generateFilename("genesis-nft-whitelist", status.toLowerCase());
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
      const [genesisItems, battalionItems] = await Promise.all([
        scanGenesisWhitelist("ALL"),
        queryBattalionWhitelist(), // No filters = all items
      ]);

      // Count Genesis by status
      const genesisActive = genesisItems.filter((item) => item.status === "ACTIVE").length;
      const genesisWithdrawn = genesisItems.filter((item) => item.status === "WITHDRAWN").length;

      // Count Battalion by status (assuming ACTIVE if no status field)
      const battalionActive = battalionItems.filter(
        (item) => !item.status || item.status === "ACTIVE"
      ).length;
      const battalionWithdrawn = battalionItems.filter(
        (item) => item.status === "WITHDRAWN"
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
        },
        requestOrigin
      );
    }

    // POST /hidden-proposals - Hide a proposal (admin only)
    if (path.endsWith("/hidden-proposals") && event.httpMethod === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
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

    return errorResponse(404, "Not found", requestOrigin);
  } catch (error: any) {
    console.error("Admin Export API error:", error);
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
