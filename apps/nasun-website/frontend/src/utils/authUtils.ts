/**
 * Generates a cryptographically secure random string for use as a code verifier or nonce.
 * @param length The length of the string to generate.
 * @returns A random string.
 */
export const generateCodeVerifier = (length = 64): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

/**
 * Parses a JWT token to extract its payload without verifying the signature.
 * @param token The JWT token string.
 * @returns The parsed payload object or null if parsing fails.
 */
export const parseJwt = (token: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
};
