/**
 * Protocol definitions for Enclave ↔ Host communication
 *
 * In production AWS Nitro:
 * - Communication happens over vsock (virtual socket)
 * - Enclave is completely isolated from network
 * - Host acts as proxy between external world and Enclave
 *
 * In local simulation:
 * - Communication happens over TCP socket
 * - Same message format and flow
 */

// Message types for Host → Enclave requests
export type EnclaveRequestType =
  | 'GET_PUBLIC_KEY'
  | 'EXECUTE_INFERENCE'
  | 'HEALTH_CHECK';

// Message types for Enclave → Host responses
export type EnclaveResponseType =
  | 'PUBLIC_KEY'
  | 'INFERENCE_RESULT'
  | 'HEALTH_STATUS'
  | 'ERROR';

/**
 * Base request structure from Host to Enclave
 */
export interface EnclaveRequest {
  type: EnclaveRequestType;
  requestId: string;
  payload: unknown;
}

/**
 * Base response structure from Enclave to Host
 */
export interface EnclaveResponse {
  type: EnclaveResponseType;
  requestId: string;
  success: boolean;
  payload: unknown;
  error?: string;
}

/**
 * Request: Get Enclave's public key for encryption
 */
export interface GetPublicKeyRequest extends EnclaveRequest {
  type: 'GET_PUBLIC_KEY';
  payload: Record<string, never>;
}

export interface GetPublicKeyResponse extends EnclaveResponse {
  type: 'PUBLIC_KEY';
  payload: {
    publicKey: string; // Base64-encoded RSA public key (SPKI format)
    attestation: AttestationDocument;
  };
}

/**
 * Request: Execute AI inference with encrypted prompt
 */
export interface ExecuteInferenceRequest extends EnclaveRequest {
  type: 'EXECUTE_INFERENCE';
  payload: {
    encryptedPrompt: string; // Base64-encoded RSA-OAEP encrypted prompt
    model: string; // Model ID (e.g., "gpt-4o-mini")
    requestId: number; // On-chain request ID
  };
}

export interface ExecuteInferenceResponse extends EnclaveResponse {
  type: 'INFERENCE_RESULT';
  payload: {
    result: string; // AI response (plaintext - will be encrypted for client later)
    resultHash: string; // SHA-256 hash of result
    executionTimeMs: number;
    attestation: AttestationDocument;
  };
}

/**
 * Request: Health check
 */
export interface HealthCheckRequest extends EnclaveRequest {
  type: 'HEALTH_CHECK';
  payload: Record<string, never>;
}

export interface HealthCheckResponse extends EnclaveResponse {
  type: 'HEALTH_STATUS';
  payload: {
    status: 'healthy' | 'unhealthy';
    uptime: number;
    version: string;
  };
}

/**
 * Attestation Document
 *
 * In production AWS Nitro:
 * - Signed by AWS Nitro hypervisor
 * - Contains PCR values (hash of enclave image)
 * - Can be verified against AWS root certificate
 *
 * In local simulation:
 * - Simulated structure with placeholder values
 * - Not cryptographically verifiable
 */
export interface AttestationDocument {
  // Enclave measurements (PCR values)
  pcrs: {
    pcr0: string; // Hash of enclave image
    pcr1: string; // Hash of kernel
    pcr2: string; // Hash of application
  };
  // Enclave metadata
  moduleId: string;
  timestamp: number;
  // In production: COSE_Sign1 signature from AWS
  // In simulation: Placeholder
  signature: string;
  // Certificate chain (empty in simulation)
  certificate: string;
}

/**
 * Configuration for vsock/TCP connection
 */
export interface ConnectionConfig {
  // For local simulation: TCP host:port
  host: string;
  port: number;
  // For production Nitro: CID (Context ID)
  cid?: number;
}

/**
 * Default ports
 */
export const ENCLAVE_PORT = 5050; // Enclave listens on this port
export const HOST_HTTP_PORT = 3000; // Host HTTP server port

/**
 * Protocol version for compatibility checking
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Create a simulated attestation document
 */
export function createSimulatedAttestation(moduleId: string): AttestationDocument {
  return {
    pcrs: {
      pcr0: 'simulated_pcr0_' + moduleId,
      pcr1: 'simulated_pcr1_kernel',
      pcr2: 'simulated_pcr2_app',
    },
    moduleId,
    timestamp: Date.now(),
    signature: 'SIMULATED_SIGNATURE_NOT_FOR_PRODUCTION',
    certificate: '',
  };
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
