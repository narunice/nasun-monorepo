import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  importPublicKey,
  encryptPrompt,
  decryptResponse,
  fetchAndCachePublicKey,
  encryptForTee,
  clearPublicKeyCache,
} from '../services/tee';

// Generate RSA-3072 keypair for testing
async function generateTestKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt'],
  );
  return keyPair;
}

// Export public key as PEM for importPublicKey() testing
async function exportPublicKeyPem(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  const b64 = Buffer.from(exported).toString('base64');
  const lines = b64.match(/.{1,64}/g)!.join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----`;
}

// Simulate Enclave-side decryption of the prompt (for round-trip testing)
async function simulateEnclaveDecrypt(
  encryptedBase64: string,
  privateKey: CryptoKey,
): Promise<string> {
  const combined = new Uint8Array(Buffer.from(encryptedBase64, 'base64'));

  // RSA-3072 produces 384-byte ciphertext
  const rsaCiphertext = combined.slice(0, 384);
  const aesCiphertext = combined.slice(384);

  // Decrypt envelope to get AES key + IV
  const envelope = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    rsaCiphertext,
  );
  const envelopeBytes = new Uint8Array(envelope);
  const aesKeyBytes = envelopeBytes.slice(0, 32);
  const iv = envelopeBytes.slice(32, 44);

  // Decrypt payload
  const aesKey = await crypto.subtle.importKey(
    'raw', aesKeyBytes, { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    aesCiphertext,
  );

  return new TextDecoder().decode(decrypted);
}

// Simulate Enclave-side encryption of the response (for response decryption testing)
async function simulateEnclaveEncryptResponse(
  plaintext: string,
  aesKeyBytes: Uint8Array,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await crypto.subtle.importKey(
    'raw', aesKeyBytes, { name: 'AES-GCM' }, false, ['encrypt'],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(plaintext),
  );

  // Format: IV(12B) || ciphertext+authTag
  const combined = new Uint8Array(12 + new Uint8Array(ciphertext).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);

  return Buffer.from(combined).toString('base64');
}

describe('importPublicKey', () => {
  it('imports RSA-3072 PEM key as CryptoKey', async () => {
    const { publicKey } = await generateTestKeyPair();
    const pem = await exportPublicKeyPem(publicKey);

    const imported = await importPublicKey(pem);

    expect(imported.type).toBe('public');
    expect(imported.algorithm).toMatchObject({ name: 'RSA-OAEP' });
    expect(imported.usages).toContain('encrypt');
  });

  it('rejects invalid PEM', async () => {
    await expect(importPublicKey('not-a-pem')).rejects.toThrow();
  });

  it('rejects empty PEM body', async () => {
    const emptyPem = '-----BEGIN PUBLIC KEY-----\n-----END PUBLIC KEY-----';
    await expect(importPublicKey(emptyPem)).rejects.toThrow();
  });
});

describe('encryptPrompt', () => {
  it('produces base64 output and AES key', async () => {
    const { publicKey } = await generateTestKeyPair();
    const { encrypted, aesKeyBytes } = await encryptPrompt(publicKey, 'hello world');

    expect(typeof encrypted).toBe('string');
    expect(encrypted.length).toBeGreaterThan(0);
    // Verify valid base64
    expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();
    expect(aesKeyBytes).toBeInstanceOf(Uint8Array);
    expect(aesKeyBytes.length).toBe(32);
  });

  it('encrypts and decrypts round-trip via simulated Enclave', async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const plaintext = 'Analyze BTC/USD risk factors for Q4 2026';

    const { encrypted } = await encryptPrompt(publicKey, plaintext);
    const decrypted = await simulateEnclaveDecrypt(encrypted, privateKey);

    expect(decrypted).toBe(plaintext);
  });

  it('handles empty string', async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const { encrypted } = await encryptPrompt(publicKey, '');
    const decrypted = await simulateEnclaveDecrypt(encrypted, privateKey);
    expect(decrypted).toBe('');
  });

  it('handles long prompt (multi-KB)', async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const longPrompt = 'A'.repeat(10_000);
    const { encrypted } = await encryptPrompt(publicKey, longPrompt);
    const decrypted = await simulateEnclaveDecrypt(encrypted, privateKey);
    expect(decrypted).toBe(longPrompt);
  });

  it('handles unicode content', async () => {
    const { publicKey, privateKey } = await generateTestKeyPair();
    const unicode = 'Analyze \u{1F4C8} BTC price and \u{1F3AF} risk factors';
    const { encrypted } = await encryptPrompt(publicKey, unicode);
    const decrypted = await simulateEnclaveDecrypt(encrypted, privateKey);
    expect(decrypted).toBe(unicode);
  });

  it('produces different ciphertext each time (random AES key + IV)', async () => {
    const { publicKey } = await generateTestKeyPair();
    const { encrypted: e1 } = await encryptPrompt(publicKey, 'same');
    const { encrypted: e2 } = await encryptPrompt(publicKey, 'same');
    expect(e1).not.toBe(e2);
  });
});

describe('decryptResponse', () => {
  it('decrypts Enclave-encrypted response', async () => {
    const aesKey = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = 'BTC/USD risk analysis: moderate volatility expected.';

    const encrypted = await simulateEnclaveEncryptResponse(plaintext, aesKey);
    const decrypted = await decryptResponse(encrypted, aesKey);

    expect(decrypted).toBe(plaintext);
  });

  it('rejects wrong AES key', async () => {
    const correctKey = crypto.getRandomValues(new Uint8Array(32));
    const wrongKey = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await simulateEnclaveEncryptResponse('secret', correctKey);

    await expect(decryptResponse(encrypted, wrongKey)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const encrypted = await simulateEnclaveEncryptResponse('secret', key);

    // Flip a byte in the ciphertext
    const bytes = Buffer.from(encrypted, 'base64');
    bytes[20] ^= 0xff;
    const tampered = bytes.toString('base64');

    await expect(decryptResponse(tampered, key)).rejects.toThrow();
  });
});

describe('fetchAndCachePublicKey', () => {
  let validPem: string;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    clearPublicKeyCache();
    // Generate a real RSA key to produce a valid PEM
    const { publicKey } = await generateTestKeyPair();
    validPem = await exportPublicKeyPem(publicKey);

    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ publicKey: validPem }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and caches public key', async () => {
    const key = await fetchAndCachePublicKey('https://executor.example.com');

    expect(key.type).toBe('public');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://executor.example.com/public-key',
      { redirect: 'error' },
    );
  });

  it('returns cached key on second call with same URL', async () => {
    await fetchAndCachePublicKey('https://executor.example.com');
    await fetchAndCachePublicKey('https://executor.example.com');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when URL changes', async () => {
    await fetchAndCachePublicKey('https://executor-a.example.com');
    await fetchAndCachePublicKey('https://executor-b.example.com');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws on HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(fetchAndCachePublicKey('https://bad.example.com'))
      .rejects.toThrow('Failed to fetch TEE public key');
  });

  it('throws when publicKey missing from response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await expect(fetchAndCachePublicKey('https://bad.example.com'))
      .rejects.toThrow('TEE public key not found');
  });

  it('rejects HTTP (non-HTTPS) URLs', async () => {
    await expect(fetchAndCachePublicKey('http://insecure.example.com'))
      .rejects.toThrow('TEE public key fetch requires HTTPS');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('re-fetches after cache TTL expires', async () => {
    await fetchAndCachePublicKey('https://executor.example.com');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Advance time past TTL (5 minutes)
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);

    await fetchAndCachePublicKey('https://executor.example.com');
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

describe('encryptForTee', () => {
  let testKeyPair: CryptoKeyPair;
  let testPem: string;

  beforeEach(async () => {
    clearPublicKeyCache();
    testKeyPair = await generateTestKeyPair();
    testPem = await exportPublicKeyPem(testKeyPair.publicKey);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ publicKey: testPem }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encrypts prompt end-to-end via executor URL', async () => {
    const plaintext = 'What are the regulatory benefits of on-chain AI audit trails?';

    const { encrypted, aesKeyBytes } = await encryptForTee(plaintext, 'https://tee.example.com');

    // Verify Enclave can decrypt
    const decrypted = await simulateEnclaveDecrypt(encrypted, testKeyPair.privateKey);
    expect(decrypted).toBe(plaintext);

    // Verify response round-trip
    const responseText = 'On-chain AI audit trails provide...';
    const encryptedResponse = await simulateEnclaveEncryptResponse(responseText, aesKeyBytes);
    const decryptedResponse = await decryptResponse(encryptedResponse, aesKeyBytes);
    expect(decryptedResponse).toBe(responseText);
  });
});
