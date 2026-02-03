import { APIGatewayProxyResult } from "aws-lambda";

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "https://nasun.io";

function getCorsOrigin(requestOrigin: string | undefined): string {
  if (!requestOrigin) return ALLOWED_ORIGINS.split(",")[0];

  const allowedList = ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  if (allowedList.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Allow localhost only in non-production environments
  if (
    process.env.NODE_ENV !== "production" &&
    requestOrigin.startsWith("http://localhost:")
  ) {
    return requestOrigin;
  }

  return allowedList[0];
}

export function corsHeaders(requestOrigin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getCorsOrigin(requestOrigin),
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Identity-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
