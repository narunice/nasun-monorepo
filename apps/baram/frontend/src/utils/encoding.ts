/**
 * Encoding utilities for Baram requests
 */

/**
 * SHA-256 hash of string content
 * @returns Hex-encoded hash string
 */
export async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert hex string to byte array (browser-compatible)
 */
export function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

/**
 * Encode prompt as Base64 (for non-TEE executors)
 */
export function encodePrompt(prompt: string): string {
  const bytes = new TextEncoder().encode(prompt);
  return btoa(String.fromCharCode(...bytes));
}
