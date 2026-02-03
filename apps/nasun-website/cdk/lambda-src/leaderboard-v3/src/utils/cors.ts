/**
 * Shared CORS utility for Leaderboard V3 Lambda handlers
 *
 * Reads allowed origins from ALLOWED_ORIGINS env var (set by CDK from constants/cors.ts).
 * Validates request origin and returns the matching origin or the first allowed origin as fallback.
 */

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function getCorsOrigin(origin?: string): string {
  if (!origin) return ALLOWED_ORIGINS[0];
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

export function corsHeaders(requestOrigin?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Username',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}
