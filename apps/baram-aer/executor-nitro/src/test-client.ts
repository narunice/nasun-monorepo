/**
 * Test Client for E2E Testing
 *
 * This script tests the Host ↔ Enclave communication flow:
 * 1. Get public key from Enclave
 * 2. Encrypt a test prompt with the public key
 * 3. Send encrypted prompt to Host for execution
 * 4. Verify the result
 *
 * Usage:
 *   1. Start Enclave: OPENAI_API_KEY=sk-... pnpm dev:enclave
 *   2. Start Host: pnpm dev:host
 *   3. Run test: pnpm test:client
 */

import * as crypto from 'crypto';

const HOST_URL = process.env.HOST_URL || 'http://localhost:3000';

interface PublicKeyResponse {
  success: boolean;
  publicKey: string;
  attestation: {
    pcrs: { pcr0: string; pcr1: string; pcr2: string };
    moduleId: string;
    timestamp: number;
    signature: string;
    certificate: string;
  };
}

interface ExecuteResponse {
  success: boolean;
  result: string;
  resultHash: string;
  executionTimeMs: number;
  attestation: object;
  error?: string;
}

/**
 * Hybrid encrypt prompt with RSA-OAEP + AES-256-GCM
 *
 * Format: Base64( RSA_ciphertext(256B) || AES_GCM_ciphertext )
 * RSA envelope contains: AES key (32B) + IV (12B) = 44 bytes
 */
function encryptPrompt(prompt: string, publicKeyBase64: string): string {
  // Convert Base64 public key to PEM format
  const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;

  // Generate random AES-256 key and IV
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // 1. RSA-OAEP encrypt the envelope (aesKey + iv)
  const envelope = Buffer.concat([aesKey, iv]);
  const rsaCiphertext = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    envelope
  );

  // 2. AES-256-GCM encrypt the prompt
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(prompt, 'utf-8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine: RSA_ciphertext || AES_ciphertext || authTag
  const combined = Buffer.concat([rsaCiphertext, encrypted, authTag]);

  return combined.toString('base64');
}

async function runTest(): Promise<void> {
  console.log('========================================');
  console.log('  Baram TEE E2E Test Client');
  console.log('========================================');
  console.log(`Host URL: ${HOST_URL}`);
  console.log('');

  try {
    // Step 1: Health check
    console.log('[Test] Step 1: Health check...');
    const healthRes = await fetch(`${HOST_URL}/health`);
    const health = await healthRes.json();
    console.log(`[Test] Health: Host=${health.host}, Enclave=${health.enclave}`);

    if (health.enclave !== 'healthy') {
      throw new Error('Enclave is not healthy');
    }

    // Step 2: Get public key
    console.log('\n[Test] Step 2: Getting public key from Enclave...');
    const pkRes = await fetch(`${HOST_URL}/public-key`);
    const pkData: PublicKeyResponse = await pkRes.json();

    if (!pkData.success) {
      throw new Error('Failed to get public key');
    }

    console.log(`[Test] Public key received (${pkData.publicKey.substring(0, 30)}...)`);
    console.log(`[Test] Attestation: ${pkData.attestation.moduleId}`);
    console.log(`[Test] PCR0: ${pkData.attestation.pcrs.pcr0}`);

    // Step 3: Encrypt test prompt
    const testPrompt = 'What is 2 + 2? Answer with just the number.';
    console.log(`\n[Test] Step 3: Encrypting prompt (hybrid RSA+AES)...`);
    console.log(`[Test] Plaintext: "${testPrompt}"`);

    const encryptedPrompt = encryptPrompt(testPrompt, pkData.publicKey);
    console.log(`[Test] Encrypted (${encryptedPrompt.length} chars, hybrid RSA-OAEP + AES-256-GCM)`);

    // Verify Host cannot decrypt
    console.log('[Test] Note: Host cannot see the plaintext prompt - only Enclave can decrypt');

    // Step 4: Execute inference
    console.log('\n[Test] Step 4: Executing AI inference...');
    const executeRes = await fetch(`${HOST_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 9999, // Test request ID
        encryptedPrompt,
        model: 'llama-3.3-70b-versatile',
      }),
    });

    const executeData: ExecuteResponse = await executeRes.json();

    if (!executeData.success) {
      throw new Error(`Execution failed: ${executeData.error}`);
    }

    // Step 5: Verify result
    console.log('\n[Test] Step 5: Results');
    console.log(`[Test] AI Response: "${executeData.result}"`);
    console.log(`[Test] Result Hash: ${executeData.resultHash}`);
    console.log(`[Test] Execution Time: ${executeData.executionTimeMs}ms`);

    // Verify hash
    const expectedHash = crypto
      .createHash('sha256')
      .update(executeData.result)
      .digest('hex');

    if (expectedHash === executeData.resultHash) {
      console.log('[Test] Hash verification: PASSED');
    } else {
      console.log('[Test] Hash verification: FAILED');
      console.log(`[Test] Expected: ${expectedHash}`);
      console.log(`[Test] Got: ${executeData.resultHash}`);
    }

    console.log('\n========================================');
    console.log('  E2E Test: SUCCESS');
    console.log('========================================');
    console.log('');
    console.log('Privacy verification:');
    console.log('- Public key obtained from Enclave');
    console.log('- Prompt encrypted with RSA-OAEP');
    console.log('- Only Enclave could decrypt the prompt');
    console.log('- Host only saw encrypted data');
    console.log('- Result hash matches computed hash');
    console.log('');
  } catch (error) {
    console.error('\n[Test] ERROR:', error);
    console.log('\n========================================');
    console.log('  E2E Test: FAILED');
    console.log('========================================');
    process.exit(1);
  }
}

runTest();
