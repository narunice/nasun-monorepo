import { createHash, randomBytes } from 'crypto';

/**
 * Generate a cryptographically random code verifier for PKCE
 */
export const generateCodeVerifier = (length: number = 128): string => {
  return randomBytes(Math.ceil(length * 3/4))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
    .slice(0, length);
};

/**
 * Generate code challenge from code verifier using SHA256
 */
export const generateCodeChallenge = (verifier: string): string => {
  return createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};

/**
 * Generate a random state parameter for OAuth
 */
export const generateState = (): string => {
  return randomBytes(32).toString('hex');
};

/**
 * Generate a unique session ID
 */
export const generateSessionId = (): string => {
  return randomBytes(16).toString('hex');
};