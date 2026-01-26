/**
 * Enclave Main Entry Point
 *
 * This is the main process running inside the Enclave.
 * It listens for requests from the Host via TCP (simulating vsock).
 *
 * In production AWS Nitro:
 * - Listens on vsock (CID-based addressing)
 * - No network access, no disk access
 * - Only communicates via vsock to Host
 *
 * In local simulation:
 * - Listens on TCP socket
 * - Same message protocol
 */

import * as net from 'net';
import {
  ENCLAVE_PORT,
  PROTOCOL_VERSION,
  createSimulatedAttestation,
  type EnclaveRequest,
  type EnclaveResponse,
  type GetPublicKeyRequest,
  type GetPublicKeyResponse,
  type ExecuteInferenceRequest,
  type ExecuteInferenceResponse,
  type HealthCheckRequest,
  type HealthCheckResponse,
} from '../shared/protocol.js';
import { initializeCrypto, getPublicKey, decrypt, destroyKeyPair } from './crypto.js';
import { initializeInference, executeInference, isInferenceReady } from './inference.js';

const MODULE_ID = 'baram-enclave-v1';
const startTime = Date.now();

/**
 * Handle incoming request from Host
 */
async function handleRequest(request: EnclaveRequest): Promise<EnclaveResponse> {
  console.log(`[Enclave] Received request: ${request.type} (${request.requestId})`);

  try {
    switch (request.type) {
      case 'GET_PUBLIC_KEY': {
        const publicKey = getPublicKey();
        if (!publicKey) {
          return {
            type: 'ERROR',
            requestId: request.requestId,
            success: false,
            payload: null,
            error: 'Crypto not initialized',
          };
        }

        const response: GetPublicKeyResponse = {
          type: 'PUBLIC_KEY',
          requestId: request.requestId,
          success: true,
          payload: {
            publicKey,
            attestation: createSimulatedAttestation(MODULE_ID),
          },
        };
        return response;
      }

      case 'EXECUTE_INFERENCE': {
        const inferenceReq = request as ExecuteInferenceRequest;
        const { encryptedPrompt, model, requestId: onChainRequestId } = inferenceReq.payload;

        // Decrypt the prompt
        console.log(`[Enclave] Decrypting prompt for request ${onChainRequestId}...`);
        const prompt = decrypt(encryptedPrompt);
        console.log(`[Enclave] Prompt decrypted successfully (${prompt.length} chars)`);

        // Execute inference
        const result = await executeInference(prompt, model);

        const response: ExecuteInferenceResponse = {
          type: 'INFERENCE_RESULT',
          requestId: request.requestId,
          success: true,
          payload: {
            result: result.result,
            resultHash: result.resultHash,
            executionTimeMs: result.executionTimeMs,
            attestation: createSimulatedAttestation(MODULE_ID),
          },
        };
        return response;
      }

      case 'HEALTH_CHECK': {
        const response: HealthCheckResponse = {
          type: 'HEALTH_STATUS',
          requestId: request.requestId,
          success: true,
          payload: {
            status: isInferenceReady() ? 'healthy' : 'unhealthy',
            uptime: Date.now() - startTime,
            version: PROTOCOL_VERSION,
          },
        };
        return response;
      }

      default:
        return {
          type: 'ERROR',
          requestId: request.requestId,
          success: false,
          payload: null,
          error: `Unknown request type: ${(request as EnclaveRequest).type}`,
        };
    }
  } catch (error) {
    console.error(`[Enclave] Error handling request:`, error);
    return {
      type: 'ERROR',
      requestId: request.requestId,
      success: false,
      payload: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Start the Enclave server
 */
async function startEnclave(): Promise<void> {
  console.log('========================================');
  console.log('  Baram TEE Enclave (Local Simulation)');
  console.log('========================================');
  console.log(`Protocol Version: ${PROTOCOL_VERSION}`);
  console.log(`Module ID: ${MODULE_ID}`);
  console.log('');

  // Initialize crypto
  const publicKey = await initializeCrypto();
  console.log(`[Enclave] Public key ready (${publicKey.substring(0, 20)}...)`);

  // Initialize inference
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    console.error('[Enclave] ERROR: OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }
  initializeInference(openaiKey);

  // Create TCP server (simulating vsock)
  const server = net.createServer((socket) => {
    console.log('[Enclave] Client connected');

    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Check for complete message (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const request: EnclaveRequest = JSON.parse(line);
          const response = await handleRequest(request);
          socket.write(JSON.stringify(response) + '\n');
        } catch (error) {
          console.error('[Enclave] Failed to parse request:', error);
          const errorResponse: EnclaveResponse = {
            type: 'ERROR',
            requestId: 'unknown',
            success: false,
            payload: null,
            error: 'Invalid JSON request',
          };
          socket.write(JSON.stringify(errorResponse) + '\n');
        }
      }
    });

    socket.on('close', () => {
      console.log('[Enclave] Client disconnected');
    });

    socket.on('error', (err) => {
      console.error('[Enclave] Socket error:', err);
    });
  });

  server.listen(ENCLAVE_PORT, '0.0.0.0', () => {
    console.log(`[Enclave] Listening on port ${ENCLAVE_PORT}`);
    console.log('[Enclave] Ready to receive requests from Host');
    console.log('');
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Enclave] Shutting down...');
    destroyKeyPair();
    server.close(() => {
      console.log('[Enclave] Server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Start the Enclave
startEnclave().catch((error) => {
  console.error('[Enclave] Fatal error:', error);
  process.exit(1);
});
