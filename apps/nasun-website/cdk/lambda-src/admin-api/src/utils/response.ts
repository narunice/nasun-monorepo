import { APIGatewayProxyResult } from "aws-lambda";

// Read from environment variable (set by CDK from shared constants/cors.ts)
const ALLOWED_LIST = (process.env.ALLOWED_ORIGINS || "https://nasun.io").split(",").map((o) => o.trim());

function getCorsOrigin(requestOrigin: string | undefined): string {
  if (!requestOrigin) return ALLOWED_LIST[0];
  return ALLOWED_LIST.includes(requestOrigin) ? requestOrigin : ALLOWED_LIST[0];
}

export function corsHeaders(requestOrigin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(requestOrigin),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function jsonResponse(
  statusCode: number,
  body: unknown,
  requestOrigin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      ...corsHeaders(requestOrigin),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export function csvResponse(
  csv: string,
  filename: string,
  requestOrigin?: string
): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      ...corsHeaders(requestOrigin),
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: csv,
  };
}

export function errorResponse(
  statusCode: number,
  message: string,
  requestOrigin?: string
): APIGatewayProxyResult {
  return jsonResponse(statusCode, { error: message }, requestOrigin);
}

export function unauthorizedResponse(requestOrigin?: string): APIGatewayProxyResult {
  return errorResponse(401, "Unauthorized: Admin access required", requestOrigin);
}
