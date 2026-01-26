/**
 * AWS Nitro Enclave Attestation Module
 *
 * In AWS Nitro Enclaves, attestation documents are obtained from the
 * Nitro Security Module (NSM) via the /dev/nsm device.
 *
 * The attestation document is a COSE_Sign1 structure containing:
 * - PCR values (hash of enclave image, kernel, application)
 * - User data (optional, can include public key hash)
 * - Nonce (optional, for freshness)
 * - AWS certificate chain for verification
 *
 * Verification:
 * 1. Verify COSE_Sign1 signature
 * 2. Verify certificate chain against AWS root CA
 * 3. Verify PCR values match expected image measurements
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { isNitroMode, type AttestationDocument } from '../shared/protocol.js';

// NSM device path in Nitro Enclave
const NSM_DEVICE_PATH = '/dev/nsm';

// Attestation document request command
const NSM_CMD_ATTESTATION = 0x01;

/**
 * Raw NSM attestation document
 */
interface NsmAttestationDocument {
  moduleId: string;
  digest: string;
  timestamp: number;
  pcrs: Map<number, Uint8Array>;
  certificate: Uint8Array;
  cabundle: Uint8Array[];
  publicKey?: Uint8Array;
  userData?: Uint8Array;
  nonce?: Uint8Array;
}

/**
 * Request attestation document from NSM
 *
 * @param userData - Optional user data to include in attestation (e.g., public key hash)
 * @param nonce - Optional nonce for freshness
 * @returns Raw attestation document bytes (COSE_Sign1 encoded)
 */
export async function requestNsmAttestation(
  userData?: Buffer,
  nonce?: Buffer
): Promise<Buffer> {
  if (!isNitroMode()) {
    throw new Error('NSM attestation only available in Nitro Enclave');
  }

  // Check if NSM device exists
  if (!fs.existsSync(NSM_DEVICE_PATH)) {
    throw new Error('NSM device not found. Are you running in a Nitro Enclave?');
  }

  // In a real implementation, we would use the NSM library (aws-nitro-enclaves-nsm-api)
  // For now, we'll provide a placeholder that can be implemented when testing on EC2

  console.log('[Attestation] Requesting attestation from NSM...');
  console.log('[Attestation] userData:', userData?.toString('hex').substring(0, 32) || 'none');
  console.log('[Attestation] nonce:', nonce?.toString('hex').substring(0, 32) || 'none');

  // TODO: Implement actual NSM call
  // This requires either:
  // 1. Native binding to NSM library (aws-nitro-enclaves-nsm-api)
  // 2. Using aws-nitro-enclaves-sdk-rs via wasm
  // 3. Calling nitro-cli get-attestation-document

  throw new Error('NSM attestation not yet implemented. Use simulation mode or implement NSM binding.');
}

/**
 * Parse COSE_Sign1 attestation document
 *
 * The document structure:
 * - Protected header: algorithm info
 * - Unprotected header: (usually empty)
 * - Payload: CBOR-encoded attestation claims
 * - Signature: ECDSA signature from AWS
 */
export function parseAttestationDocument(rawDoc: Buffer): NsmAttestationDocument {
  // COSE_Sign1 is CBOR-encoded
  // Structure: [protected, unprotected, payload, signature]

  // TODO: Implement CBOR parsing
  // This requires a CBOR library (cbor, cbor-x, etc.)

  throw new Error('Attestation document parsing not yet implemented');
}

/**
 * Convert NSM attestation to protocol format
 */
export function convertToProtocolFormat(nsm: NsmAttestationDocument): AttestationDocument {
  // Convert PCR map to hex strings
  const pcr0 = nsm.pcrs.get(0);
  const pcr1 = nsm.pcrs.get(1);
  const pcr2 = nsm.pcrs.get(2);

  return {
    pcrs: {
      pcr0: pcr0 ? Buffer.from(pcr0).toString('hex') : '',
      pcr1: pcr1 ? Buffer.from(pcr1).toString('hex') : '',
      pcr2: pcr2 ? Buffer.from(pcr2).toString('hex') : '',
    },
    moduleId: nsm.moduleId,
    timestamp: nsm.timestamp,
    signature: 'COSE_Sign1', // Actual signature is in the raw document
    certificate: Buffer.from(nsm.certificate).toString('base64'),
  };
}

/**
 * Get attestation document with public key hash as user data
 *
 * This binds the attestation to a specific public key, proving that
 * the key was generated inside this specific enclave instance.
 *
 * @param publicKey - Base64-encoded RSA public key
 * @returns Attestation document
 */
export async function getAttestationWithPublicKey(
  publicKey: string
): Promise<AttestationDocument> {
  // Hash the public key to include in attestation
  const publicKeyHash = crypto.createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest();

  // Generate a random nonce for freshness
  const nonce = crypto.randomBytes(32);

  try {
    // Request attestation from NSM
    const rawDoc = await requestNsmAttestation(publicKeyHash, nonce);

    // Parse the COSE_Sign1 document
    const parsedDoc = parseAttestationDocument(rawDoc);

    // Convert to protocol format
    return convertToProtocolFormat(parsedDoc);
  } catch (error) {
    // Fall back to simulated attestation if NSM not available
    console.warn('[Attestation] NSM not available, using simulated attestation');
    console.warn('[Attestation] Error:', error);

    return createSimulatedNitroAttestation(publicKey);
  }
}

/**
 * Create a simulated Nitro attestation for testing
 *
 * This is NOT cryptographically verifiable but has the same structure
 */
export function createSimulatedNitroAttestation(publicKey: string): AttestationDocument {
  const publicKeyHash = crypto.createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest()
    .toString('hex');

  // Generate fake PCR values based on module ID
  const moduleId = 'baram-enclave-v1';
  const pcr0 = crypto.createHash('sha384').update(`${moduleId}-image`).digest().toString('hex');
  const pcr1 = crypto.createHash('sha384').update(`${moduleId}-kernel`).digest().toString('hex');
  const pcr2 = crypto.createHash('sha384').update(`${moduleId}-app`).digest().toString('hex');

  return {
    pcrs: {
      pcr0,
      pcr1,
      pcr2,
    },
    moduleId,
    timestamp: Date.now(),
    signature: 'SIMULATED_NITRO_ATTESTATION_NOT_FOR_PRODUCTION',
    certificate: '', // No certificate in simulation
  };
}

/**
 * Verify attestation document (client-side or host-side)
 *
 * Steps:
 * 1. Parse COSE_Sign1 structure
 * 2. Verify signature against AWS certificate
 * 3. Verify certificate chain against AWS root CA
 * 4. Check PCR values match expected measurements
 * 5. Verify timestamp is recent
 * 6. Optionally verify user data (public key hash)
 */
export function verifyAttestationDocument(
  rawDoc: Buffer,
  expectedPcrs?: { pcr0?: string; pcr1?: string; pcr2?: string },
  maxAgeMs?: number
): { valid: boolean; error?: string } {
  // TODO: Implement verification
  // This requires:
  // 1. COSE signature verification library
  // 2. X.509 certificate chain verification
  // 3. AWS Nitro root CA certificate

  // For now, return a placeholder
  console.warn('[Attestation] Verification not implemented');

  return {
    valid: false,
    error: 'Attestation verification not yet implemented',
  };
}

/**
 * AWS Nitro Enclave root CA certificate
 *
 * This is used to verify the certificate chain in attestation documents.
 * The actual certificate should be obtained from AWS documentation.
 */
export const AWS_NITRO_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIICETCCAZagAwIBAgIRAPkxdWgbkK/hHUbMtOTn+FYwCgYIKoZIzj0EAwMwSTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoMBkFtYXpvbjEMMAoGA1UECwwDQVdTMRswGQYD
VQQDDBJhd3Mubml0cm8tZW5jbGF2ZXMwHhcNMTkxMDI4MTMyODA1WhcNNDkxMDI4
MTQyODA1WjBJMQswCQYDVQQGEwJVUzEPMA0GA1UECgwGQW1hem9uMQwwCgYDVQQL
DANBV1MxGzAZBgNVBAMMEmF3cy5uaXRyby1lbmNsYXZlczB2MBAGByqGSM49AgEG
BSuBBAAiA2IABPwCVOumCMHzaHDimtqQvkY4MpJzbolL//Zy2YlES1BR5TSksfbb
48C8WBoyt7F2Bw7eEtaaP+ohG2bnUs990d0JX28TcPQXCEPZ3BABIeTPYwEoCWZE
h8l5YoQwTcU/9KNCMEAwDwYDVR0TAQH/BAUwAwEB/zAdBgNVHQ4EFgQUkCW1DdkF
R+eWw5b6cp3PmanfS5YwDgYDVR0PAQH/BAQDAgGGMAoGCCqGSM49BAMDA2kAMGYC
MQCjfy+Rocm9Xue4YnwWmNJVA44fA0P5W2OpYow9OYCVRaEevL8uO1XYru5xtMPW
rfMCMQCi85sWBbJwKKXdS6BptQFuZbT73o/gBh1qUxl/nNr12UO8Yfwr6wPLb+6N
IwLz3/Y=
-----END CERTIFICATE-----`;
