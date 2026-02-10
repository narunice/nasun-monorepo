export * from './suiParsers';

/**
 * Build Authorization header for admin API requests.
 */
export function authHeaders(cognitoToken: string): Record<string, string> {
  return { 'Authorization': `Bearer ${cognitoToken}` };
}
