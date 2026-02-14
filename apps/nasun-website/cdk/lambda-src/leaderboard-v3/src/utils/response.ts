import { APIGatewayProxyResult } from 'aws-lambda';
import { corsHeaders } from './cors';

/**
 * Create a standardized API Gateway response with CORS headers.
 * Takes requestOrigin as an explicit parameter to avoid module-level mutable state.
 */
export function createResponse(
  statusCode: number,
  body: object,
  requestOrigin?: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(requestOrigin),
    body: JSON.stringify(body),
  };
}

/**
 * Extract the request origin from an API Gateway event's headers.
 */
export function getRequestOrigin(headers?: Record<string, string | undefined>): string | undefined {
  return headers?.origin || headers?.Origin;
}
