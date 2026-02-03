/**
 * Generates a cryptographically secure random string for use as a code verifier or nonce.
 * Uses crypto.getRandomValues() for unpredictable output resistant to CSRF attacks.
 * @param length The length of the string to generate.
 * @returns A random string.
 */
export const generateCodeVerifier = (length = 64): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(randomValues[i] % possible.length);
  }
  return text;
};

/**
 * Parses a JWT token to extract its payload without verifying the signature.
 * Handles Base64Url encoding and UTF-8 characters.
 * @param token The JWT token string.
 * @returns The parsed payload object or null if parsing fails.
 */
export const parseJwt = (token: string): Record<string, unknown> | null => {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;

    // Replace Base64Url characters with Base64 characters
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');

    // Add padding - required by atob in some browsers (e.g. Edge)
    const padding = base64.length % 4;
    if (padding) {
      base64 += '='.repeat(4 - padding);
    }

    // Decode Base64 and handle UTF-8 characters correctly
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error parsing JWT:', error);
    return null;
  }
};
