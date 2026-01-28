/**
 * AWS Nitro Enclave Attestation Module
 *
 * Uses aws-nitro-enclaves-nsm-node for native NSM access.
 * Parses COSE_Sign1 attestation documents using cbor-x.
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { decode as cborDecode } from 'cbor-x';
import { isNitroMode, type AttestationDocument } from '../shared/protocol.js';

// NSM device path in Nitro Enclave
const NSM_DEVICE_PATH = '/dev/nsm';

// NSM library interface
interface NsmLib {
  open: () => number;
  close: (fd: number) => void;
  getAttestationDoc: (
    fd: number,
    userData: Buffer | null,
    nonce: Buffer | null,
    publicKey: Buffer | null
  ) => Buffer;
}

// Cached NSM library
let nsmLib: NsmLib | null = null;

/**
 * Dynamically load NSM library (only available in Nitro Enclave)
 */
async function loadNsmLibrary(): Promise<NsmLib> {
  if (nsmLib) return nsmLib;

  try {
    const nsm = await import('aws-nitro-enclaves-nsm-node');
    nsmLib = {
      open: nsm.open,
      close: nsm.close,
      getAttestationDoc: nsm.getAttestationDoc,
    };
    console.log('[Attestation] NSM library loaded successfully');
    return nsmLib;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load NSM library: ${msg}`);
  }
}

/**
 * Raw NSM attestation payload (parsed from COSE_Sign1)
 */
interface NsmAttestationPayload {
  module_id: string;
  digest: string;
  timestamp: number;
  pcrs: Map<number, Buffer>;
  certificate: Buffer;
  cabundle: Buffer[];
  public_key?: Buffer;
  user_data?: Buffer;
  nonce?: Buffer;
}

/**
 * Request attestation document from NSM
 */
export async function requestNsmAttestation(
  userData?: Buffer,
  nonce?: Buffer,
  publicKey?: Buffer
): Promise<Buffer> {
  if (!isNitroMode()) {
    throw new Error('NSM attestation only available in Nitro Enclave');
  }

  console.log('[Attestation] Requesting attestation from NSM...');
  console.log('[Attestation] userData:', userData?.toString('hex').substring(0, 32) || 'none');
  console.log('[Attestation] nonce:', nonce?.toString('hex').substring(0, 32) || 'none');

  // Load NSM library
  const nsm = await loadNsmLibrary();

  // Open NSM device
  const fd = nsm.open();
  console.log('[Attestation] NSM device opened, fd:', fd);

  try {
    // Request attestation document
    const attestationDoc = nsm.getAttestationDoc(
      fd,
      userData || null,
      nonce || null,
      publicKey || null
    );
    console.log('[Attestation] Received attestation document, size:', attestationDoc.length);
    return attestationDoc;
  } finally {
    // Always close the file descriptor
    nsm.close(fd);
    console.log('[Attestation] NSM device closed');
  }
}

/**
 * Parse COSE_Sign1 attestation document
 */
export function parseAttestationDocument(rawDoc: Buffer): NsmAttestationPayload {
  // COSE_Sign1 structure: [protected, unprotected, payload, signature]
  const coseSign1 = cborDecode(rawDoc);

  if (!Array.isArray(coseSign1) || coseSign1.length !== 4) {
    throw new Error('Invalid COSE_Sign1 structure');
  }

  const [_protectedHeader, _unprotectedHeader, payload, _signature] = coseSign1;

  // Decode the payload (CBOR-encoded attestation claims)
  const attestation = cborDecode(payload);

  // Extract PCRs
  const pcrs = new Map<number, Buffer>();
  if (attestation.pcrs) {
    for (const [key, value] of Object.entries(attestation.pcrs)) {
      pcrs.set(parseInt(key), Buffer.from(value as Uint8Array));
    }
  }

  // Convert BigInt timestamp to number (CBOR may return BigInt)
  const timestamp = attestation.timestamp
    ? Number(attestation.timestamp)
    : Date.now();

  return {
    module_id: attestation.module_id || 'unknown',
    digest: attestation.digest || 'SHA384',
    timestamp,
    pcrs,
    certificate: Buffer.from(attestation.certificate || []),
    cabundle: (attestation.cabundle || []).map((c: Uint8Array) => Buffer.from(c)),
    public_key: attestation.public_key ? Buffer.from(attestation.public_key) : undefined,
    user_data: attestation.user_data ? Buffer.from(attestation.user_data) : undefined,
    nonce: attestation.nonce ? Buffer.from(attestation.nonce) : undefined,
  };
}

/**
 * Convert NSM attestation to protocol format
 */
export function convertToProtocolFormat(nsm: NsmAttestationPayload): AttestationDocument {
  // Convert PCR map to hex strings
  const pcr0 = nsm.pcrs.get(0);
  const pcr1 = nsm.pcrs.get(1);
  const pcr2 = nsm.pcrs.get(2);

  return {
    pcrs: {
      pcr0: pcr0 ? pcr0.toString('hex') : '',
      pcr1: pcr1 ? pcr1.toString('hex') : '',
      pcr2: pcr2 ? pcr2.toString('hex') : '',
    },
    moduleId: nsm.module_id,
    timestamp: nsm.timestamp,
    signature: 'COSE_Sign1', // Actual signature is in the raw document
    certificate: nsm.certificate.toString('base64'),
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
/**
 * Check if real NSM attestation is available
 * Returns true if in Nitro mode (actual NSM access is determined at runtime)
 */
export function isNsmAvailable(): boolean {
  return isNitroMode();
}

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
