/**
 * Crypto helpers for Nasun AI key storage (ported from baram chatCrypto.ts).
 *
 * PBKDF2(walletAddress + passphrase) -> AES-256-GCM key. Used by agentKeyStorage.
 * Salt prefix is namespaced to nasun-ai so storage cannot collide with the
 * legacy baram dashboard if both ever co-exist on the same origin.
 */

const PBKDF2_ITERATIONS = 100000;
const SALT_PREFIX = 'nasun-ai:agent:';
const IV_LENGTH = 12;

let cachedKey: { fingerprint: string; key: CryptoKey } | null = null;

export async function deriveStorageKey(walletAddress: string, password?: string): Promise<CryptoKey> {
  const material = password ? `${walletAddress}:${password}` : walletAddress;
  const fingerprint = await sha256Text(material);
  if (cachedKey && cachedKey.fingerprint === fingerprint) return cachedKey.key;

  const encoder = new TextEncoder();
  const salt = encoder.encode(`${SALT_PREFIX}${walletAddress}`);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(material),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  cachedKey = { fingerprint, key };
  return key;
}

export async function encryptData(key: CryptoKey, data: string): Promise<{ encrypted: string; iv: string }> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(data));
  return { encrypted: arrayBufferToBase64(encrypted), iv: arrayBufferToBase64(iv.buffer as ArrayBuffer) };
}

export async function decryptData(key: CryptoKey, encryptedBase64: string, ivBase64: string): Promise<string> {
  const encrypted = base64ToArrayBuffer(encryptedBase64);
  const iv = base64ToArrayBuffer(ivBase64);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}

export function clearCachedKey(): void {
  cachedKey = null;
}

async function sha256Text(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
