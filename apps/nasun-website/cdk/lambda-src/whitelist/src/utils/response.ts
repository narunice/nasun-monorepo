/**
 * API Gateway response helpers
 */

// Read from environment variable (set by CDK from shared constants/cors.ts)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

function resolveOrigin(requestOrigin?: string): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  const normalized = requestOrigin.replace(/\/$/, '');
  return ALLOWED_ORIGINS.includes(normalized) ? normalized : ALLOWED_ORIGINS[0];
}

export function corsHeaders(requestOrigin?: string) {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

export function successResponse(data: any, statusCode: number = 200, requestOrigin?: string) {
  return {
    statusCode,
    headers: corsHeaders(requestOrigin),
    body: JSON.stringify({
      success: true,
      data
    })
  };
}

export function errorResponse(
  error: string,
  message: string,
  statusCode: number = 400,
  data?: any,
  requestOrigin?: string
) {
  return {
    statusCode,
    headers: corsHeaders(requestOrigin),
    body: JSON.stringify({
      success: false,
      error,
      message,
      ...(data && { data })
    })
  };
}

export function csvResponse(csvContent: string, filename: string, requestOrigin?: string) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': resolveOrigin(requestOrigin),
    },
    body: csvContent
  };
}
