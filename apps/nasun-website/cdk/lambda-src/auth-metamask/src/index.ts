import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { handleChallenge } from './handlers/challenge';
import { handleVerify } from './handlers/verify';
import { maskSensitiveData } from './utils/log-utils';

// SECURITY: Allowed origins whitelist for CORS validation
const ALLOWED_ORIGINS = [
  'https://nasun.io',
  'https://www.nasun.io',
  'https://staging.nasun.io',
  'https://gensol.io',
  'https://www.gensol.io',
  'http://localhost:5174',
  'http://localhost:5173',
];

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

    if (path.includes('/challenge')) {
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
