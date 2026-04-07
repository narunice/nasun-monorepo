/**
 * Genesis Pass Sync Stage Lambda
 *
 * POST /genesis-pass/admin/sync-stage
 *
 * JWT-authorized endpoint for admin use.
 * Updates the SSM parameter to match the on-chain contract stage.
 * Called by the admin page after a successful setStage transaction.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { SSMClient, PutParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({});

const STAGE_PARAM_NAME = process.env.STAGE_PARAM_NAME;
const ADMIN_IDENTITY_IDS = (process.env.ADMIN_IDENTITY_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());

if (!STAGE_PARAM_NAME) {
  throw new Error("Missing STAGE_PARAM_NAME environment variable");
}

const VALID_STAGES = [0, 1, 2, 3, 4];

function getCorsOrigin(event: APIGatewayProxyEvent): string {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

function jsonResponse(statusCode: number, body: Record<string, unknown>, origin: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "false",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const origin = getCorsOrigin(event);

  // Extract identity from authorizer context
  const identityId = event.requestContext?.authorizer?.principalId;
  if (!identityId) {
    return jsonResponse(401, { success: false, error: "UNAUTHORIZED", message: "Authentication required" }, origin);
  }

  // Admin check
  if (ADMIN_IDENTITY_IDS.length > 0 && !ADMIN_IDENTITY_IDS.includes(identityId)) {
    console.warn(`[sync-stage] Non-admin attempt: ${identityId}`);
    return jsonResponse(403, { success: false, error: "FORBIDDEN", message: "Admin access required" }, origin);
  }

  // Parse body
  let stage: number;
  try {
    const body = JSON.parse(event.body || "{}");
    stage = Number(body.stage);
  } catch {
    return jsonResponse(400, { success: false, error: "INVALID_BODY", message: "Invalid request body" }, origin);
  }

  if (!VALID_STAGES.includes(stage)) {
    return jsonResponse(400, { success: false, error: "INVALID_STAGE", message: `Stage must be one of: ${VALID_STAGES.join(", ")}` }, origin);
  }

  // Update SSM parameter
  try {
    await ssmClient.send(new PutParameterCommand({
      Name: STAGE_PARAM_NAME,
      Value: String(stage),
      Type: "String",
      Overwrite: true,
    }));

    console.log(`[sync-stage] SSM updated to stage ${stage} by ${identityId}`);

    return jsonResponse(200, {
      success: true,
      data: { stage, updatedBy: identityId },
    }, origin);
  } catch (err) {
    console.error("[sync-stage] SSM update failed:", err);
    return jsonResponse(500, { success: false, error: "SSM_UPDATE_FAILED", message: "Failed to update stage parameter" }, origin);
  }
}
