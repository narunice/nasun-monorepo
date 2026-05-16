import { APIGatewayProxyResult } from 'aws-lambda';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io')
  .split(',')
  .map((o) => o.trim());

export function corsHeaders(origin?: string): Record<string, string> {
  const normalized = origin?.replace(/\/$/, '');
  const allowed = normalized && ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Type': 'application/json',
  };
}

export function json(statusCode: number, body: unknown, headers: Record<string, string>): APIGatewayProxyResult {
  return { statusCode, headers, body: JSON.stringify(body) };
}

export function badRequest(message: string, headers: Record<string, string>) {
  return json(400, { message }, headers);
}

export function unauthorized(headers: Record<string, string>) {
  return json(401, { message: 'Unauthorized. Valid authentication token required.' }, headers);
}

export function notFound(message: string, headers: Record<string, string>) {
  return json(404, { message }, headers);
}

export function conflict(message: string, extra: Record<string, unknown>, headers: Record<string, string>) {
  return json(409, { message, ...extra }, headers);
}

export function methodNotAllowed(headers: Record<string, string>) {
  return json(405, { message: 'Method Not Allowed' }, headers);
}

export function serverError(headers: Record<string, string>) {
  return json(500, { message: 'Internal Server Error' }, headers);
}
