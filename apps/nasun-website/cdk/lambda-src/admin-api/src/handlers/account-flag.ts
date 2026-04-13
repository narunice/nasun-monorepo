/**
 * Account Flag Admin Handler
 *
 * Flags or unflags a user account on UserProfiles. Flagged accounts are
 * excluded from airdrops (and may be excluded from future leaderboard /
 * points pipelines) without modifying their existing point balances.
 *
 * GET    /users/{identityId}/flag - Read flag status
 * PUT    /users/{identityId}/flag - Set flag (body: { flagged: bool, reason?: string })
 */

import { APIGatewayProxyHandler, APIGatewayProxyResult } from "aws-lambda";
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { verifyAdminRole, extractIdentityIdFromAuthorizer } from "../utils/auth.js";
import { jsonResponse, errorResponse, unauthorizedResponse } from "../utils/response.js";

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || "UserProfiles";

const MAX_REASON_LEN = 500;

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

  const targetId = event.pathParameters?.identityId;
  if (!targetId) {
    return errorResponse(400, "Missing identityId in path", requestOrigin);
  }
  const decodedTarget = decodeURIComponent(targetId);

  // Self-flag protection: an admin must not be able to lock themselves out.
  if (decodedTarget === admin.identityId) {
    return errorResponse(400, "Admins cannot flag their own account", requestOrigin);
  }

  try {
    const existing = await dynamoClient.send(
      new GetItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: { identityId: { S: decodedTarget } },
      })
    );
    if (!existing.Item) {
      return errorResponse(404, "User profile not found", requestOrigin);
    }

    if (event.httpMethod === "GET") {
      return jsonResponse(200, {
        success: true,
        identityId: decodedTarget,
        isAccountFlagged: existing.Item.isAccountFlagged?.BOOL === true,
        flagReason: existing.Item.flagReason?.S || null,
        flaggedAt: existing.Item.flaggedAt?.S || null,
        flaggedBy: existing.Item.flaggedBy?.S || null,
      }, requestOrigin);
    }

    if (event.httpMethod === "PUT") {
      let body: Record<string, unknown>;
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return errorResponse(400, "Invalid JSON", requestOrigin);
      }

      if (typeof body.flagged !== "boolean") {
        return errorResponse(400, "Body must include 'flagged: boolean'", requestOrigin);
      }

      // Refuse to flag another admin (defense in depth — admins should not be
      // silently disabled by another admin via a bug-report side door).
      if (body.flagged === true && existing.Item.role?.S === "ADMIN") {
        return errorResponse(403, "Cannot flag an admin account", requestOrigin);
      }

      const now = new Date().toISOString();

      if (body.flagged) {
        const rawReason = typeof body.reason === "string" ? body.reason.trim() : "";
        const reason = rawReason.slice(0, MAX_REASON_LEN);
        await dynamoClient.send(
          new UpdateItemCommand({
            TableName: USER_PROFILES_TABLE,
            Key: { identityId: { S: decodedTarget } },
            UpdateExpression:
              "SET isAccountFlagged = :t, flagReason = :r, flaggedAt = :now, flaggedBy = :by",
            ExpressionAttributeValues: {
              ":t": { BOOL: true },
              ":r": { S: reason },
              ":now": { S: now },
              ":by": { S: admin.identityId },
            },
          })
        );
        console.log(`[account-flag] FLAGGED ${decodedTarget} by ${admin.email || admin.identityId}: ${reason}`);
        return jsonResponse(200, {
          success: true,
          identityId: decodedTarget,
          isAccountFlagged: true,
          flagReason: reason,
          flaggedAt: now,
          flaggedBy: admin.identityId,
        }, requestOrigin);
      }

      await dynamoClient.send(
        new UpdateItemCommand({
          TableName: USER_PROFILES_TABLE,
          Key: { identityId: { S: decodedTarget } },
          UpdateExpression: "REMOVE isAccountFlagged, flagReason, flaggedAt, flaggedBy",
        })
      );
      console.log(`[account-flag] UNFLAGGED ${decodedTarget} by ${admin.email || admin.identityId}`);
      return jsonResponse(200, {
        success: true,
        identityId: decodedTarget,
        isAccountFlagged: false,
      }, requestOrigin);
    }

    return errorResponse(405, "Method not allowed", requestOrigin);
  } catch (error: unknown) {
    console.error("[account-flag] Error:", error instanceof Error ? error.message : String(error));
    return errorResponse(500, "Internal server error", requestOrigin);
  }
};
