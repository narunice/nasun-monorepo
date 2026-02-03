/**
 * Generates a cryptographically secure random string for use as a code verifier or nonce.
 * @param length The length of the string to generate.
 * @returns A random string.
 */
export const generateCodeVerifier = (length = 64): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const randomValues = crypto.getRandomValues(new Uint8Array(length))
  let text = ''
  for (let i = 0; i < length; i++) {
    text += possible.charAt(randomValues[i] % possible.length)
  }
  return text
}

/**
 * Parses a JWT token to extract its payload without verifying the signature.
 * @param token The JWT token string.
 * @returns The parsed payload object or null if parsing fails.
 */
export const parseJwt = (token: string): Record<string, unknown> | null => {
  try {
    // URL-safe Base64를 표준 Base64로 변환
    const base64 = token.split('.')[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}
