/**
 * Utility functions for safe logging
 * Masks sensitive data to prevent CloudWatch exposure
 */

const SENSITIVE_FIELDS = [
  'signature',
  'nonce',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'secret',
  'password',
  'token',
  'apiKey',
  'secretKey',
  'authorization',
  'cookie',
];

/**
 * Mask sensitive data in objects before logging to CloudWatch
 * Prevents accidental exposure of secrets, tokens, and signatures
 */
export function maskSensitiveData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => maskSensitiveData(item)) as T;
  }

  // Handle objects
  const masked = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f.toLowerCase()))) {
      masked[key] = '[REDACTED]';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked as T;
}

/**
 * Create a safe version of API Gateway event for logging
 * Masks sensitive headers and body fields
 */
export function createSafeEventLog(event: {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  body?: string | null;
}): Record<string, unknown> {
  return {
    httpMethod: event.httpMethod,
    path: event.path,
    headers: maskSensitiveData(event.headers),
    queryStringParameters: maskSensitiveData(event.queryStringParameters),
    // Don't log body at all - it contains sensitive signature/nonce data
    bodyPresent: !!event.body,
  };
}
