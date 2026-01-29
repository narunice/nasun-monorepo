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
 * @returns Attestation document with raw COSE_Sign1 for verification
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

    // Convert to protocol format and include raw document for verification
    const attestation = convertToProtocolFormat(parsedDoc);
    attestation.rawDocument = rawDoc.toString('base64');

    return attestation;
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

/**
 * Verification result with detailed information
 */
export interface VerificationResult {
  valid: boolean;
  error?: string;
  details?: {
    signatureValid: boolean;
    certificateChainValid: boolean;
    pcrMatch: boolean;
    timestampValid: boolean;
    pcrs?: { pcr0: string; pcr1: string; pcr2: string };
    certificate?: string;
  };
}

/**
 * Parse COSE protected header to extract algorithm
 */
function parseCoseProtectedHeader(protectedHeader: Buffer): { alg: number } {
  const decoded = cborDecode(protectedHeader);
  // Algorithm ID: ES384 = -35 (ECDSA with SHA-384)
  return { alg: decoded[1] || decoded.get?.(1) || -35 };
}

/**
 * Build COSE Sig_structure for verification
 * Sig_structure = ["Signature1", protected, external_aad, payload]
 */
function buildSigStructure(
  protectedHeader: Buffer,
  payload: Buffer,
  externalAad: Buffer = Buffer.alloc(0)
): Buffer {
  const { encode } = require('cbor-x');
  const sigStructure = [
    'Signature1',
    protectedHeader,
    externalAad,
    payload,
  ];
  return Buffer.from(encode(sigStructure));
}

/**
 * Verify ECDSA P-384 signature
 */
function verifyEcdsaP384Signature(
  publicKey: crypto.KeyObject,
  message: Buffer,
  signature: Buffer
): boolean {
  try {
    // AWS Nitro uses raw ECDSA signature (r || s), each 48 bytes for P-384
    // Node.js crypto expects DER-encoded signature
    const r = signature.subarray(0, 48);
    const s = signature.subarray(48, 96);

    // Convert to DER format
    const derSignature = convertRawToDerSignature(r, s);

    const verify = crypto.createVerify('SHA384');
    verify.update(message);
    return verify.verify(publicKey, derSignature);
  } catch (error) {
    console.error('[Attestation] Signature verification error:', error);
    return false;
  }
}

/**
 * Convert raw ECDSA signature (r || s) to DER format
 */
function convertRawToDerSignature(r: Buffer, s: Buffer): Buffer {
  // Remove leading zeros but keep one if high bit is set
  const trimInteger = (buf: Buffer): Buffer => {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0 && (buf[i + 1] & 0x80) === 0) {
      i++;
    }
    const trimmed = buf.subarray(i);
    // Add leading zero if high bit is set (to indicate positive integer)
    if (trimmed[0] & 0x80) {
      return Buffer.concat([Buffer.from([0]), trimmed]);
    }
    return trimmed;
  };

  const rDer = trimInteger(r);
  const sDer = trimInteger(s);

  // DER structure: SEQUENCE { INTEGER r, INTEGER s }
  const rLen = rDer.length;
  const sLen = sDer.length;
  const totalLen = 2 + rLen + 2 + sLen;

  const der = Buffer.alloc(2 + totalLen);
  let offset = 0;

  // SEQUENCE tag
  der[offset++] = 0x30;
  der[offset++] = totalLen;

  // INTEGER r
  der[offset++] = 0x02;
  der[offset++] = rLen;
  rDer.copy(der, offset);
  offset += rLen;

  // INTEGER s
  der[offset++] = 0x02;
  der[offset++] = sLen;
  sDer.copy(der, offset);

  return der;
}

/**
 * Parse X.509 certificate and extract public key
 */
function extractPublicKeyFromCertificate(certDer: Buffer): crypto.KeyObject {
  const certPem = `-----BEGIN CERTIFICATE-----\n${certDer.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
  const cert = new crypto.X509Certificate(certPem);
  return cert.publicKey;
}

/**
 * Verify certificate chain against AWS Nitro Root CA
 */
function verifyCertificateChain(
  certificate: Buffer,
  caBundle: Buffer[]
): { valid: boolean; error?: string } {
  try {
    // Build the full chain: [end-entity, ...intermediates, root]
    const endEntityPem = `-----BEGIN CERTIFICATE-----\n${certificate.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
    const endEntityCert = new crypto.X509Certificate(endEntityPem);

    // Convert CA bundle to X509Certificates
    const caCerts = caBundle.map((cert) => {
      const pem = `-----BEGIN CERTIFICATE-----\n${cert.toString('base64').match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
      return new crypto.X509Certificate(pem);
    });

    // Parse the trusted root CA
    const rootCaCert = new crypto.X509Certificate(AWS_NITRO_ROOT_CA);

    // Verify chain: end-entity -> intermediates -> root
    let currentCert = endEntityCert;

    // Check intermediates
    for (const caCert of caCerts) {
      if (!currentCert.checkIssued(caCert)) {
        continue; // Try next CA cert
      }
      // Verify signature
      if (!currentCert.verify(caCert.publicKey)) {
        return { valid: false, error: `Certificate signature verification failed` };
      }
      currentCert = caCert;
    }

    // Finally verify against root CA
    if (!currentCert.verify(rootCaCert.publicKey)) {
      // Try if current cert IS the root
      if (currentCert.fingerprint !== rootCaCert.fingerprint) {
        return { valid: false, error: 'Root CA verification failed' };
      }
    }

    // Check certificate validity dates
    const now = new Date();
    if (now < new Date(endEntityCert.validFrom) || now > new Date(endEntityCert.validTo)) {
      return { valid: false, error: 'End-entity certificate expired or not yet valid' };
    }

    return { valid: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `Certificate chain verification error: ${msg}` };
  }
}

/**
 * Verify attestation document
 *
 * Steps:
 * 1. Parse COSE_Sign1 structure
 * 2. Verify signature against certificate
 * 3. Verify certificate chain against AWS root CA
 * 4. Check PCR values match expected measurements
 * 5. Verify timestamp is recent
 */
export function verifyAttestationDocument(
  rawDoc: Buffer,
  expectedPcrs?: { pcr0?: string; pcr1?: string; pcr2?: string },
  maxAgeMs: number = 5 * 60 * 1000 // Default 5 minutes
): VerificationResult {
  try {
    console.log('[Attestation] Starting verification...');

    // Step 1: Parse COSE_Sign1 structure
    const coseSign1 = cborDecode(rawDoc);
    if (!Array.isArray(coseSign1) || coseSign1.length !== 4) {
      return { valid: false, error: 'Invalid COSE_Sign1 structure' };
    }

    const [protectedHeader, _unprotectedHeader, payload, signature] = coseSign1;
    const protectedBuf = Buffer.from(protectedHeader);
    const payloadBuf = Buffer.from(payload);
    const signatureBuf = Buffer.from(signature);

    // Parse the attestation payload
    const attestation = cborDecode(payloadBuf);
    const certificate = Buffer.from(attestation.certificate || []);
    const caBundle = (attestation.cabundle || []).map((c: Uint8Array) => Buffer.from(c));

    // Step 2: Extract public key from certificate
    let publicKey: crypto.KeyObject;
    try {
      publicKey = extractPublicKeyFromCertificate(certificate);
    } catch (error) {
      return { valid: false, error: 'Failed to extract public key from certificate' };
    }

    // Step 3: Verify COSE signature
    const sigStructure = buildSigStructure(protectedBuf, payloadBuf);
    const signatureValid = verifyEcdsaP384Signature(publicKey, sigStructure, signatureBuf);

    if (!signatureValid) {
      console.log('[Attestation] Signature verification failed');
      return {
        valid: false,
        error: 'COSE signature verification failed',
        details: { signatureValid: false, certificateChainValid: false, pcrMatch: false, timestampValid: false },
      };
    }
    console.log('[Attestation] Signature verified successfully');

    // Step 4: Verify certificate chain
    const chainResult = verifyCertificateChain(certificate, caBundle);
    if (!chainResult.valid) {
      console.log('[Attestation] Certificate chain verification failed:', chainResult.error);
      return {
        valid: false,
        error: chainResult.error,
        details: { signatureValid: true, certificateChainValid: false, pcrMatch: false, timestampValid: false },
      };
    }
    console.log('[Attestation] Certificate chain verified successfully');

    // Step 5: Extract and verify PCRs
    const pcrs = new Map<number, Buffer>();
    if (attestation.pcrs) {
      for (const [key, value] of Object.entries(attestation.pcrs)) {
        pcrs.set(parseInt(key), Buffer.from(value as Uint8Array));
      }
    }

    const pcr0 = pcrs.get(0)?.toString('hex') || '';
    const pcr1 = pcrs.get(1)?.toString('hex') || '';
    const pcr2 = pcrs.get(2)?.toString('hex') || '';

    let pcrMatch = true;
    if (expectedPcrs) {
      if (expectedPcrs.pcr0 && expectedPcrs.pcr0 !== pcr0) {
        pcrMatch = false;
        console.log(`[Attestation] PCR0 mismatch: expected ${expectedPcrs.pcr0}, got ${pcr0}`);
      }
      if (expectedPcrs.pcr1 && expectedPcrs.pcr1 !== pcr1) {
        pcrMatch = false;
        console.log(`[Attestation] PCR1 mismatch: expected ${expectedPcrs.pcr1}, got ${pcr1}`);
      }
      if (expectedPcrs.pcr2 && expectedPcrs.pcr2 !== pcr2) {
        pcrMatch = false;
        console.log(`[Attestation] PCR2 mismatch: expected ${expectedPcrs.pcr2}, got ${pcr2}`);
      }
    }

    // Step 6: Verify timestamp
    const timestamp = attestation.timestamp ? Number(attestation.timestamp) : 0;
    const now = Date.now();
    const timestampValid = timestamp > 0 && (now - timestamp) < maxAgeMs;

    if (!timestampValid && timestamp > 0) {
      console.log(`[Attestation] Timestamp too old: ${now - timestamp}ms ago (max: ${maxAgeMs}ms)`);
    }

    const valid = signatureValid && chainResult.valid && pcrMatch && timestampValid;

    return {
      valid,
      error: valid ? undefined : 'One or more verification checks failed',
      details: {
        signatureValid: true,
        certificateChainValid: true,
        pcrMatch,
        timestampValid,
        pcrs: { pcr0, pcr1, pcr2 },
        certificate: certificate.toString('base64'),
      },
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Attestation] Verification error:', error);
    return { valid: false, error: `Verification failed: ${msg}` };
  }
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
