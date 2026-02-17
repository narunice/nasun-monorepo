/**
 * Error Parser Utility
 * Converts API and network errors into user-friendly messages
 */

export type ErrorType =
  | 'AUTH_FAILED'
  | 'NETWORK_ERROR'
  | 'RATE_LIMIT'
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'GENERIC';

export interface ParsedError {
  message: string;
  code?: string;
  isKnown: boolean;
  errorType?: ErrorType;
}

// AWS API Gateway / Lambda error patterns
const AWS_ERRORS: { pattern: RegExp; message: string; errorType?: ErrorType }[] = [
  {
    pattern: /Unauthorized|401/i,
    message: 'Authentication failed. Please log in again.',
    errorType: 'AUTH_FAILED',
  },
  {
    pattern: /Forbidden|403/i,
    message: 'Access denied. You do not have permission to perform this action.',
    errorType: 'FORBIDDEN',
  },
  {
    pattern: /Not Found|404/i,
    message: 'Resource not found.',
    errorType: 'NOT_FOUND',
  },
  {
    pattern: /Bad Request|400/i,
    message: 'Invalid request. Please check your input.',
    errorType: 'VALIDATION_ERROR',
  },
  {
    pattern: /429|Too Many Requests|rate.?limit/i,
    message: 'Too many requests. Please wait a moment before trying again.',
    errorType: 'RATE_LIMIT',
  },
  {
    pattern: /500|Internal Server Error/i,
    message: 'Server error. Please try again later.',
    errorType: 'SERVER_ERROR',
  },
  {
    pattern: /503|Service Unavailable/i,
    message: 'Service temporarily unavailable. Please try again in a few seconds.',
    errorType: 'SERVER_ERROR',
  },
  {
    pattern: /502|Bad Gateway/i,
    message: 'Gateway error. The service may be temporarily down.',
    errorType: 'SERVER_ERROR',
  },
  {
    pattern: /504|Gateway Timeout/i,
    message: 'Request timed out. Please try again.',
    errorType: 'SERVER_ERROR',
  },
];

// Network / RPC errors
const NETWORK_ERRORS: { pattern: RegExp; message: string; errorType?: ErrorType }[] = [
  {
    pattern: /fetch failed|Failed to fetch|NetworkError|ECONNREFUSED/i,
    message: 'Network error. Check your connection and try again.',
    errorType: 'NETWORK_ERROR',
  },
  {
    pattern: /timeout|ETIMEDOUT|AbortError/i,
    message: 'Request timed out. The network may be congested — try again shortly.',
    errorType: 'NETWORK_ERROR',
  },
  {
    pattern: /CORS|Cross-Origin/i,
    message: 'Cross-origin request blocked. Please contact support.',
    errorType: 'NETWORK_ERROR',
  },
  {
    pattern: /DNS|getaddrinfo/i,
    message: 'DNS error. Check your connection and try again.',
    errorType: 'NETWORK_ERROR',
  },
];

// OAuth and authentication errors
const AUTH_ERRORS: { pattern: RegExp; message: string; errorType?: ErrorType }[] = [
  {
    pattern: /invalid_grant|invalid_token/i,
    message: 'Authentication token expired. Please log in again.',
    errorType: 'AUTH_FAILED',
  },
  {
    pattern: /access_denied/i,
    message: 'Access denied. Please grant the required permissions.',
    errorType: 'FORBIDDEN',
  },
  {
    pattern: /invalid_client/i,
    message: 'Authentication configuration error. Please contact support.',
    errorType: 'AUTH_FAILED',
  },
  {
    pattern: /session.*expired/i,
    message: 'Your session has expired. Please log in again.',
    errorType: 'AUTH_FAILED',
  },
];

// Validation errors
const VALIDATION_ERRORS: { pattern: RegExp; message: string; errorType?: ErrorType }[] = [
  {
    pattern: /invalid.*email/i,
    message: 'Invalid email address.',
    errorType: 'VALIDATION_ERROR',
  },
  {
    pattern: /invalid.*url/i,
    message: 'Invalid URL format.',
    errorType: 'VALIDATION_ERROR',
  },
  {
    pattern: /required.*field/i,
    message: 'Required field is missing.',
    errorType: 'VALIDATION_ERROR',
  },
  {
    pattern: /duplicate|already exists/i,
    message: 'This resource already exists.',
    errorType: 'VALIDATION_ERROR',
  },
];

// All error patterns combined
const ALL_ERROR_PATTERNS = [
  ...AWS_ERRORS,
  ...NETWORK_ERRORS,
  ...AUTH_ERRORS,
  ...VALIDATION_ERRORS,
];

/**
 * Parse error message into user-friendly format
 */
export function parseError(error: unknown): ParsedError {
  const errorStr = error instanceof Error ? error.message : String(error);

  // Detect already-formatted errors
  const alreadyFormatted = errorStr.match(/\[([A-Z_]+-\d+)\]\s*$/);
  if (alreadyFormatted) {
    const code = alreadyFormatted[1];
    const message = errorStr.replace(/\s*\[[A-Z_]+-\d+\]\s*$/, '').trim();
    return { message, code, isKnown: true };
  }

  // Match against known error patterns
  for (const { pattern, message, errorType } of ALL_ERROR_PATTERNS) {
    if (pattern.test(errorStr)) {
      return {
        message,
        isKnown: true,
        errorType,
      };
    }
  }

  // Unknown errors: show generic message, log details for debugging
  if (import.meta.env.DEV) {
    console.warn('[parseError] Unknown error:', errorStr);
  }
  return {
    message: 'An error occurred. Please try again.',
    isKnown: false,
    errorType: 'GENERIC',
  };
}

/**
 * Format error message for UI display
 */
export function formatErrorMessage(error: unknown): string {
  const parsed = parseError(error);
  const message = parsed.code ? `${parsed.message} [${parsed.code}]` : parsed.message;
  return message;
}

/**
 * Check if error is retryable (network/timeout errors)
 */
export function isRetryableError(error: unknown): boolean {
  const parsed = parseError(error);
  return parsed.errorType === 'NETWORK_ERROR' || parsed.errorType === 'SERVER_ERROR';
}

/**
 * Check if error requires re-authentication
 */
export function requiresReauth(error: unknown): boolean {
  const parsed = parseError(error);
  return parsed.errorType === 'AUTH_FAILED';
}
