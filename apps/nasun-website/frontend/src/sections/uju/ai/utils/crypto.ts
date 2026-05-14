/**
 * Hybrid RSA-OAEP + AES-256-GCM encryption for TEE communication.
 *
 * Prompt:   Base64( RSA_OAEP(aesKey || iv) || AES_GCM_ciphertext+tag )
 * Response: Base64( IV(12B) || AES_GCM_ciphertext+tag )
 */

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\n/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(pem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
}

export interface EncryptResult {
  encrypted: string;
  aesKeyBytes: Uint8Array;
}

export async function encryptWithRSA(
  publicKey: CryptoKey,
  plaintext: string,
): Promise<EncryptResult> {
  const data = new TextEncoder().encode(plaintext);
  const aesKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const aesCiphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);

  const envelope = new Uint8Array(44);
  envelope.set(aesKeyBytes, 0);
  envelope.set(iv, 32);
  const rsaCiphertext = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, envelope);

  const rsaBytes = new Uint8Array(rsaCiphertext);
  const aesBytes = new Uint8Array(aesCiphertext);
  const combined = new Uint8Array(rsaBytes.length + aesBytes.length);
  combined.set(rsaBytes, 0);
  combined.set(aesBytes, rsaBytes.length);

  let binary = '';
  for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i]);
  return { encrypted: btoa(binary), aesKeyBytes };
}

export async function decryptResponse(
  encryptedBase64: string,
  aesKeyBytes: Uint8Array,
): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertextWithTag = combined.slice(12);

  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesKeyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertextWithTag,
  );
  return new TextDecoder().decode(decrypted);
}
