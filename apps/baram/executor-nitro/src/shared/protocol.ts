/**
 * Protocol definitions for Enclave ↔ Host communication
 *
 * Inference Modes:
 *
 * 1. Local LLM Mode (USE_LOCAL_LLM=true):
 *    - LLM runs inside Enclave using llama.cpp
 *    - Prompts NEVER leave the TEE - complete privacy protection
 *    - Requires model file in Docker image
 *
 * 2. Proxy Mode (USE_OPENAI_PROXY=true):
 *    - Host proxies OpenAI calls for Enclave
 *    - Decrypted prompts visible to Host (partial privacy)
 *
 * 3. Direct Mode (neither):
 *    - Enclave calls OpenAI directly
 *    - Only works in simulation (Nitro has no network)
 *
 * Transport:
 *
 * - Production AWS Nitro: vsock (virtual socket)
 * - Local simulation: TCP socket
 */

// Message types for Host → Enclave requests
export type EnclaveRequestType =
  | 'GET_PUBLIC_KEY'
  | 'EXECUTE_INFERENCE'
  | 'HEALTH_CHECK'
  | 'OPENAI_PROXY_RESPONSE'; // Response from Host's OpenAI proxy

// Message types for Enclave → Host responses
export type EnclaveResponseType =
  | 'PUBLIC_KEY'
  | 'INFERENCE_RESULT'
  | 'HEALTH_STATUS'
  | 'ERROR'
  | 'OPENAI_PROXY_REQUEST'; // Request from Enclave for Host to call OpenAI

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
    model: string; // Model ID (e.g., "llama-3.1-8b-instant")
    requestId: number; // On-chain request ID
  };
}

export interface ExecuteInferenceResponse extends EnclaveResponse {
  type: 'INFERENCE_RESULT';
  payload: {
    result: string; // AI response — if encrypted: Base64(IV || ciphertext || authTag)
    resultHash: string; // SHA-256 hash of plaintext result (computed by Enclave)
    executionTimeMs: number;
    attestation: AttestationDocument;
    encrypted?: boolean; // true = result is AES-256-GCM encrypted (E2E)
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
 * OpenAI Proxy Protocol (for Nitro mode where Enclave has no network)
 *
 * Flow:
 * 1. Host → Enclave: EXECUTE_INFERENCE (encrypted prompt)
 * 2. Enclave decrypts prompt
 * 3. Enclave → Host: OPENAI_PROXY_REQUEST (plaintext prompt) ⚠️
 * 4. Host calls OpenAI API
 * 5. Host → Enclave: OPENAI_PROXY_RESPONSE (result)
 * 6. Enclave generates result hash and attestation
 * 7. Enclave → Host: INFERENCE_RESULT
 *
 * Security note: In proxy mode, the Host sees the plaintext prompt.
 * For complete privacy, use Local LLM mode (USE_LOCAL_LLM=true) instead.
 */
export interface OpenAIProxyRequest extends EnclaveResponse {
  type: 'OPENAI_PROXY_REQUEST';
  payload: {
    proxyRequestId: string; // Internal ID for this proxy request
    model: string;
    prompt: string; // Decrypted prompt (plaintext)
    maxTokens?: number;
    temperature?: number;
  };
}

export interface OpenAIProxyResponse extends EnclaveRequest {
  type: 'OPENAI_PROXY_RESPONSE';
  payload: {
    proxyRequestId: string; // Matches the request
    success: boolean;
    result?: string;
    error?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
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
  // Raw COSE_Sign1 document for off-chain verification (Base64)
  // Only present in production Nitro mode
  rawDocument?: string;
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
export const PROTOCOL_VERSION = '1.3.0'; // Bumped for native vsock support

/**
 * Local LLM model configurations
 *
 * These models run entirely within the Enclave - prompts never leave the TEE.
 */
export const LOCAL_MODEL_CONFIG = {
  'llama-3.2-3b-local': {
    maxTokens: 512,
    contextSize: 2048,
    description: 'Llama 3.2 3B Instruct (Q4_K_M quantized)',
    fileSize: '~2GB',
    memoryRequired: '~4GB',
  },
  'llama-3.2-1b-local': {
    maxTokens: 512,
    contextSize: 2048,
    description: 'Llama 3.2 1B Instruct (Q4_K_M quantized)',
    fileSize: '~800MB',
    memoryRequired: '~2GB',
  },
} as const;

/**
 * Check if local LLM mode is enabled
 * When enabled, prompts are processed entirely within the Enclave
 */
export function useLocalLLM(): boolean {
  return process.env.USE_LOCAL_LLM === 'true';
}

/**
 * Check if running in Nitro mode (Enclave has no network)
 */
export function isNitroMode(): boolean {
  return process.env.USE_VSOCK === 'true' || process.env.NITRO_MODE === 'true';
}

/**
 * Check if OpenAI proxy mode is enabled
 * In Nitro mode, Enclave cannot access network, so Host proxies OpenAI calls
 */
export function useOpenAIProxy(): boolean {
  // Default to proxy mode in Nitro
  const explicit = process.env.USE_OPENAI_PROXY;
  if (explicit !== undefined) {
    return explicit === 'true';
  }
  return isNitroMode();
}

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
