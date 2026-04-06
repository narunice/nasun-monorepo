/**
 * Airdrop Admin Handler
 *
 * GET  /airdrop/registrations - List all registrations
 * PUT  /airdrop/registrations/{identityId} - Update status
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import {
  DynamoDBClient,
  ScanCommand,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { verifyAdminRole, extractIdentityIdFromAuthorizer } from "../utils/auth.js";
import { jsonResponse, errorResponse, unauthorizedResponse } from "../utils/response.js";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const AIRDROP_TABLE = process.env.AIRDROP_TABLE || "nasun-airdrop-registrations";

export const handler: APIGatewayProxyHandler = async (event): Promise<APIGatewayProxyResult> => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: "" };
  }

  const identityId = extractIdentityIdFromAuthorizer(event.requestContext);
  if (!identityId) {
    return unauthorizedResponse(requestOrigin);
  }

  const admin = await verifyAdminRole(identityId);
  if (!admin) {
    return unauthorizedResponse(requestOrigin);
  }

  const path = event.path;

  try {
    // GET /airdrop/registrations
    if (path.endsWith("/registrations") && event.httpMethod === "GET") {
      const items: Array<Record<string, string | boolean | number | undefined>> = [];
      let lastKey: Record<string, any> | undefined;
      do {
        const result = await dynamoClient.send(
          new ScanCommand({
            TableName: AIRDROP_TABLE,
            ...(lastKey && { ExclusiveStartKey: lastKey }),
          })
        );
        for (const item of result.Items || []) {
          items.push({
            identityId: item.identityId?.S || "",
            status: item.status?.S || "",
            walletAddress: item.walletAddress?.S || "",
            twitterHandle: item.twitterHandle?.S || "",
            registeredAt: item.registeredAt?.S || "",
            approvedAt: item.approvedAt?.S || "",
            probableBot: item.probableBot?.BOOL === true,
            botTier: item.botTier?.N ? Number(item.botTier.N) : undefined,
          });
        }
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

      items.sort((a, b) => (b.registeredAt || "").localeCompare(a.registeredAt || ""));
      return jsonResponse(200, { success: true, items }, requestOrigin);
    }

    // PUT /airdrop/registrations/{identityId}
    if (path.includes("/registrations/") && event.httpMethod === "PUT") {
      const targetId = event.pathParameters?.identityId;
      if (!targetId) {
        return errorResponse(400, "Missing identityId in path", requestOrigin);
      }

      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON", requestOrigin);
      }

      const newStatus = body.status as string | undefined;
      if (!newStatus || !["pending", "approved", "rejected"].includes(newStatus)) {
        return errorResponse(400, "Invalid status. Must be 'pending', 'approved', or 'rejected'.", requestOrigin);
      }

      const decodedId = decodeURIComponent(targetId);

      const existing = await dynamoClient.send(
        new GetItemCommand({
          TableName: AIRDROP_TABLE,
          Key: { identityId: { S: decodedId } },
        })
      );
      if (!existing.Item) {
        return errorResponse(404, "Registration not found", requestOrigin);
      }

      const updates = ["#s = :s"];
      const names: Record<string, string> = { "#s": "status" };
      const values: Record<string, { S: string }> = { ":s": { S: newStatus } };

      if (newStatus === "approved") {
        updates.push("approvedAt = :now", "approvedBy = :adminId");
        values[":now"] = { S: new Date().toISOString() };
        values[":adminId"] = { S: admin.identityId };
      }

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: AIRDROP_TABLE,
          Key: { identityId: { S: decodedId } },
          UpdateExpression: `SET ${updates.join(", ")}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        })
      );

      console.log(`[airdrop-admin] Status updated by ${admin.email}: ${decodedId} -> ${newStatus}`);
      return jsonResponse(200, { success: true, identityId: decodedId, status: newStatus }, requestOrigin);
    }

    return errorResponse(404, "Not found", requestOrigin);
  } catch (error: unknown) {
    console.error("[airdrop-admin] Error:", error instanceof Error ? error.message : String(error));
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
