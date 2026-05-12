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

    // Step 4: Verify legacy /execute is gone (Plan C F16).
    // /execute now returns 410 Gone. Full E2E coverage of the capability-
    // gated path lives in apps/baram/docs/smoke-b2-runbook.md, which forges
    // a capability + envelope + lineage block — far beyond what this stub
    // harness was meant to do. We assert the migration response shape here
    // so the test-client still catches regressions in the 410 contract.
    console.log('\n[Test] Step 4: Verifying /execute is gone (410 Gone)...');
    const executeRes = await fetch(`${HOST_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: 9999,
        encryptedPrompt,
        model: 'llama-3.3-70b-versatile',
      }),
    });

    if (executeRes.status !== 410) {
      throw new Error(
        `Expected 410 Gone on /execute, got ${executeRes.status}. ` +
          'The legacy path should have been removed in Plan C.',
      );
    }
    const executeData = (await executeRes.json()) as ExecuteResponse & {
      migration?: { replacementEndpoint?: string };
    };
    if (executeData.migration?.replacementEndpoint !== '/execute-capability') {
      throw new Error(
        '410 response is missing the migration.replacementEndpoint hint',
      );
    }
    console.log('[Test] /execute correctly returns 410 with migration metadata.');
    console.log(
      '[Test] For end-to-end smoke including /execute-capability, run apps/baram/docs/smoke-b2-runbook.md',
    );

    console.log('\n========================================');
    console.log('  Public-key + /execute migration check: SUCCESS');
    console.log('========================================');
    console.log('');
    console.log('Verified:');
    console.log('- Public key obtained from Enclave');
    console.log('- Prompt encrypted with RSA-OAEP + AES-256-GCM');
    console.log('- Legacy /execute returns 410 Gone with migration hint');
    console.log('- Caller is directed at /execute-capability');
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
