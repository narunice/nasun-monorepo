import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleChallenge } from './handlers/challenge';
import { handleVerify } from './handlers/verify';
import { handlePrepare } from './handlers/prepare';
import { handleConnectVerify } from './handlers/connect-verify';
import { maskSensitiveData } from './utils/log-utils';

// Read from environment variable (set by CDK from shared constants/cors.ts)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io').split(',').map(o => o.trim());

// SECURITY: Dynamic CORS headers based on validated origin + security headers
const getSecurityHeaders = (origin?: string) => {
  const normalizedOrigin = origin?.replace(/\/$/, '');
  const allowedOrigin = normalizedOrigin && ALLOWED_ORIGINS.includes(normalizedOrigin)
    ? normalizedOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = getSecurityHeaders(origin);

  // CORS Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const path = event.path || event.resource || '';

    // Order matters: /connect-verify must match before /verify (substring overlap)
    if (path.includes('/prepare')) {
      return await handlePrepare(event, headers);
    } else if (path.includes('/connect-verify')) {
      return await handleConnectVerify(event, headers);
    } else if (path.includes('/challenge')) {
      return await handleChallenge(event, headers);
    } else if (path.includes('/verify')) {
      return await handleVerify(event, headers);
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Not Found' }),
    };
  } catch (error: any) {
    console.error('Error:', maskSensitiveData({ message: error?.message, stack: error?.stack }));
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal Server Error' }),
    };
  }
};
