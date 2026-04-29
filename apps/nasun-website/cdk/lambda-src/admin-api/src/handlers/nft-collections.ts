import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import {
  DynamoDBClient,
  ScanCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "crypto";
import { verifyAdminRole, extractIdentityIdFromAuthorizer, verifyTokenManually } from "../utils/auth.js";
import { corsHeaders, jsonResponse, errorResponse, unauthorizedResponse } from "../utils/response.js";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const NFT_COLLECTIONS_TABLE = process.env.NFT_COLLECTIONS_TABLE || "nasun-nft-collections";

type NFTChain = "ethereum" | "polygon";

interface NftCollectionItem {
  collectionId: string;
  contractAddress: string;
  chain: NFTChain;
  collectionName: string;
  // Matches the activation SK prefix used by ownership-verifier (e.g. "genesis-pass").
  // Optional in storage so legacy rows continue to load; new writes always set it.
  nftTypeId?: string;
  enabled: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Valid chains for validation
const VALID_CHAINS: NFTChain[] = ["ethereum", "polygon"];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// nftTypeId must be lowercase slug (no spaces, no '#') so it can be safely
// concatenated into activation SKs like `${nftTypeId}#${walletAddress}`.
const NFT_TYPE_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

function isValidEthAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function isValidNftTypeId(id: string): boolean {
  return NFT_TYPE_ID_REGEX.test(id);
}

/**
 * Scan all NFT collections from DynamoDB
 */
async function scanCollections(enabledOnly: boolean): Promise<NftCollectionItem[]> {
  const items: NftCollectionItem[] = [];
  let lastEvaluatedKey: Record<string, any> | undefined;

  do {
    const command = new ScanCommand({
      TableName: NFT_COLLECTIONS_TABLE,
      FilterExpression: enabledOnly ? "#enabled = :enabled" : undefined,
      ExpressionAttributeNames: enabledOnly ? { "#enabled": "enabled" } : undefined,
      ExpressionAttributeValues: enabledOnly ? { ":enabled": { BOOL: true } } : undefined,
      ExclusiveStartKey: lastEvaluatedKey,
    });

    const result = await dynamoClient.send(command);

    if (result.Items) {
      for (const item of result.Items) {
        items.push({
          collectionId: item.collectionId?.S || "",
          contractAddress: item.contractAddress?.S || "",
          chain: (item.chain?.S as NFTChain) || "ethereum",
          collectionName: item.collectionName?.S || "",
          nftTypeId: item.nftTypeId?.S || undefined,
          enabled: item.enabled?.BOOL ?? true,
          featured: item.featured?.BOOL ?? false,
          createdAt: item.createdAt?.S || "",
          updatedAt: item.updatedAt?.S || "",
          createdBy: item.createdBy?.S || "",
        });
      }
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Sort by createdAt descending
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}

/**
 * Create a new NFT collection
 */
async function createCollection(
  contractAddress: string,
  chain: NFTChain,
  collectionName: string,
  nftTypeId: string,
  createdBy: string,
  featured = false
): Promise<NftCollectionItem> {
  const now = new Date().toISOString();
  const item: NftCollectionItem = {
    collectionId: randomUUID(),
    contractAddress: contractAddress.toLowerCase(),
    chain,
    collectionName,
    nftTypeId,
    enabled: true,
    featured,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  await dynamoClient.send(
    new PutItemCommand({
      TableName: NFT_COLLECTIONS_TABLE,
      Item: {
        collectionId: { S: item.collectionId },
        contractAddress: { S: item.contractAddress },
        chain: { S: item.chain },
        collectionName: { S: item.collectionName },
        nftTypeId: { S: nftTypeId },
        enabled: { BOOL: item.enabled },
        featured: { BOOL: item.featured },
        createdAt: { S: item.createdAt },
        updatedAt: { S: item.updatedAt },
        createdBy: { S: item.createdBy },
      },
    })
  );

  return item;
}

/**
 * Update an NFT collection
 */
async function updateCollection(
  collectionId: string,
  updates: Partial<Pick<NftCollectionItem, "collectionName" | "enabled" | "featured" | "contractAddress" | "chain" | "nftTypeId">>
): Promise<NftCollectionItem | null> {
  // Verify the item exists
  const existing = await dynamoClient.send(
    new GetItemCommand({
      TableName: NFT_COLLECTIONS_TABLE,
      Key: { collectionId: { S: collectionId } },
    })
  );

  if (!existing.Item) return null;

  // Business rule: disabling a collection also clears featured
  if (updates.enabled === false) {
    updates.featured = false;
  }

  const now = new Date().toISOString();
  const expressions: string[] = ["#updatedAt = :updatedAt"];
  const names: Record<string, string> = { "#updatedAt": "updatedAt" };
  const values: Record<string, any> = { ":updatedAt": { S: now } };

  if (updates.collectionName !== undefined) {
    expressions.push("#collectionName = :collectionName");
    names["#collectionName"] = "collectionName";
    values[":collectionName"] = { S: updates.collectionName };
  }
  if (updates.enabled !== undefined) {
    expressions.push("#enabled = :enabled");
    names["#enabled"] = "enabled";
    values[":enabled"] = { BOOL: updates.enabled };
  }
  if (updates.contractAddress !== undefined) {
    expressions.push("#contractAddress = :contractAddress");
    names["#contractAddress"] = "contractAddress";
    values[":contractAddress"] = { S: updates.contractAddress.toLowerCase() };
  }
  if (updates.featured !== undefined) {
    expressions.push("#featured = :featured");
    names["#featured"] = "featured";
    values[":featured"] = { BOOL: updates.featured };
  }
  if (updates.chain !== undefined) {
    expressions.push("#chain = :chain");
    names["#chain"] = "chain";
    values[":chain"] = { S: updates.chain };
  }
  if (updates.nftTypeId !== undefined) {
    expressions.push("#nftTypeId = :nftTypeId");
    names["#nftTypeId"] = "nftTypeId";
    values[":nftTypeId"] = { S: updates.nftTypeId };
  }

  const result = await dynamoClient.send(
    new UpdateItemCommand({
      TableName: NFT_COLLECTIONS_TABLE,
      Key: { collectionId: { S: collectionId } },
      UpdateExpression: `SET ${expressions.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: "ALL_NEW",
    })
  );

  if (!result.Attributes) return null;

  const attr = result.Attributes;
  return {
    collectionId: attr.collectionId?.S || "",
    contractAddress: attr.contractAddress?.S || "",
    chain: (attr.chain?.S as NFTChain) || "ethereum",
    collectionName: attr.collectionName?.S || "",
    nftTypeId: attr.nftTypeId?.S || undefined,
    enabled: attr.enabled?.BOOL ?? true,
    featured: attr.featured?.BOOL ?? false,
    createdAt: attr.createdAt?.S || "",
    updatedAt: attr.updatedAt?.S || "",
    createdBy: attr.createdBy?.S || "",
  };
}

/**
 * Delete an NFT collection
 */
async function deleteCollection(collectionId: string): Promise<boolean> {
  const existing = await dynamoClient.send(
    new GetItemCommand({
      TableName: NFT_COLLECTIONS_TABLE,
      Key: { collectionId: { S: collectionId } },
    })
  );

  if (!existing.Item) return false;

  await dynamoClient.send(
    new DeleteItemCommand({
      TableName: NFT_COLLECTIONS_TABLE,
      Key: { collectionId: { S: collectionId } },
    })
  );

  return true;
}

/**
 * Main handler for NFT collection management
 */
export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(requestOrigin), body: "" };
  }

  console.log("NFT Collections API called:", {
    httpMethod: event.httpMethod,
    path: event.path,
    pathParameters: event.pathParameters,
  });

  const path = event.path;

  try {
    // GET /nft-collections - Public endpoint (enabled collections only)
    if (event.httpMethod === "GET" && !event.pathParameters?.id) {
      // Check for admin query param to return all collections
      const isAdminRequest = event.queryStringParameters?.admin === "true";

      if (isAdminRequest) {
        // Admin request — manual token verification (this endpoint has NONE auth at API Gateway level)
        const authHeader = event.headers?.["Authorization"] || event.headers?.["authorization"];
        const identityId = await verifyTokenManually(authHeader);
        if (!identityId) return unauthorizedResponse(requestOrigin);

        const admin = await verifyAdminRole(identityId);
        if (!admin) return unauthorizedResponse(requestOrigin);

        const collections = await scanCollections(false);
        return jsonResponse(200, { collections }, requestOrigin);
      }

      // Public request — only enabled collections
      const collections = await scanCollections(true);
      return jsonResponse(200, { collections }, requestOrigin);
    }

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

    // POST /nft-collections - Create collection
    if (event.httpMethod === "POST") {
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON in request body", requestOrigin);
      }
      const { contractAddress, chain, collectionName, nftTypeId, featured } = body;

      if (!contractAddress || !chain || !collectionName || !nftTypeId) {
        return errorResponse(
          400,
          "Missing required fields: contractAddress, chain, collectionName, nftTypeId",
          requestOrigin,
        );
      }

      if (!isValidEthAddress(contractAddress as string)) {
        return errorResponse(400, "Invalid contract address format (must be 0x + 40 hex characters)", requestOrigin);
      }

      if (!VALID_CHAINS.includes(chain as NFTChain)) {
        return errorResponse(400, `Invalid chain. Must be one of: ${VALID_CHAINS.join(", ")}`, requestOrigin);
      }

      if ((collectionName as string).length > 100) {
        return errorResponse(400, "Collection name must be 100 characters or less", requestOrigin);
      }

      if (typeof nftTypeId !== "string" || !isValidNftTypeId(nftTypeId)) {
        return errorResponse(
          400,
          "nftTypeId must be lowercase slug: a-z, 0-9, '-' (1-64 chars, must start with alphanumeric)",
          requestOrigin,
        );
      }

      if (featured !== undefined && typeof featured !== "boolean") {
        return errorResponse(400, "featured must be a boolean", requestOrigin);
      }

      console.log(`Creating NFT collection: ${collectionName} (${chain}: ${contractAddress}, nftTypeId: ${nftTypeId})`);
      const collection = await createCollection(
        contractAddress as string,
        chain as NFTChain,
        collectionName as string,
        nftTypeId,
        admin.identityId,
        (featured as boolean | undefined) ?? false,
      );
      return jsonResponse(201, { collection }, requestOrigin);
    }

    // PUT /nft-collections/{id} - Update collection
    if (event.httpMethod === "PUT" && event.pathParameters?.id) {
      const collectionId = event.pathParameters.id;
      if (!isValidUUID(collectionId)) {
        return errorResponse(400, "Invalid collection ID format", requestOrigin);
      }
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON in request body", requestOrigin);
      }
      const { collectionName, enabled, featured, contractAddress, chain, nftTypeId } = body;

      // Validate optional fields if provided
      if (featured !== undefined && typeof featured !== "boolean") {
        return errorResponse(400, "featured must be a boolean", requestOrigin);
      }
      if (contractAddress !== undefined && !isValidEthAddress(contractAddress as string)) {
        return errorResponse(400, "Invalid contract address format", requestOrigin);
      }
      if (chain !== undefined && !VALID_CHAINS.includes(chain as NFTChain)) {
        return errorResponse(400, `Invalid chain. Must be one of: ${VALID_CHAINS.join(", ")}`, requestOrigin);
      }
      if (collectionName !== undefined && (collectionName as string).length > 100) {
        return errorResponse(400, "Collection name must be 100 characters or less", requestOrigin);
      }
      if (nftTypeId !== undefined && (typeof nftTypeId !== "string" || !isValidNftTypeId(nftTypeId))) {
        return errorResponse(
          400,
          "nftTypeId must be lowercase slug: a-z, 0-9, '-' (1-64 chars, must start with alphanumeric)",
          requestOrigin,
        );
      }

      console.log(`Updating NFT collection: ${collectionId}`);
      const updated = await updateCollection(collectionId, {
        collectionName: collectionName as string | undefined,
        enabled: enabled as boolean | undefined,
        featured: featured as boolean | undefined,
        contractAddress: contractAddress as string | undefined,
        chain: chain as NFTChain | undefined,
        nftTypeId: nftTypeId as string | undefined,
      });

      if (!updated) {
        return errorResponse(404, "Collection not found", requestOrigin);
      }

      return jsonResponse(200, { collection: updated }, requestOrigin);
    }

    // DELETE /nft-collections/{id} - Delete collection
    if (event.httpMethod === "DELETE" && event.pathParameters?.id) {
      const collectionId = event.pathParameters.id;
      if (!isValidUUID(collectionId)) {
        return errorResponse(400, "Invalid collection ID format", requestOrigin);
      }

      console.log(`Deleting NFT collection: ${collectionId}`);
      const deleted = await deleteCollection(collectionId);

      if (!deleted) {
        return errorResponse(404, "Collection not found", requestOrigin);
      }

      return jsonResponse(200, { success: true, collectionId }, requestOrigin);
    }

    return errorResponse(404, "Not found", requestOrigin);
  } catch (error: unknown) {
    console.error("NFT Collections API error:", error instanceof Error ? error.message : String(error));
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
