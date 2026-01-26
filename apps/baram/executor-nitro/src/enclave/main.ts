/**
 * Enclave Main Entry Point
 *
 * This is the main process running inside the Enclave.
 *
 * Two modes of operation:
 *
 * 1. Local Simulation (TCP):
 *    - Listens on TCP socket
 *    - Direct OpenAI API calls
 *    - Simulated attestation
 *
 * 2. AWS Nitro (vsock + proxy):
 *    - Listens on vsock (CID-based addressing)
 *    - No network access, no disk access
 *    - OpenAI calls proxied through Host
 *    - Real attestation from /dev/attestation
 */

import * as net from 'net';
import {
  ENCLAVE_PORT,
  PROTOCOL_VERSION,
  createSimulatedAttestation,
  useOpenAIProxy,
  isNitroMode,
  generateRequestId,
  type EnclaveRequest,
  type EnclaveResponse,
  type GetPublicKeyRequest,
  type GetPublicKeyResponse,
  type ExecuteInferenceRequest,
  type ExecuteInferenceResponse,
  type HealthCheckRequest,
  type HealthCheckResponse,
  type OpenAIProxyRequest,
  type OpenAIProxyResponse,
} from '../shared/protocol.js';
import { createVsockServer, isVsockMode } from '../shared/vsock.js';
import { initializeCrypto, getPublicKey, decrypt, destroyKeyPair } from './crypto.js';
import {
  initializeInference,
  initializeInferenceProxy,
  initializeInferenceLocal,
  executeInference,
  isInferenceReady,
  isInProxyMode,
  isInLocalMode,
  unloadModel,
  type OpenAIProxyFunction,
} from './inference.js';

const MODULE_ID = 'baram-enclave-v1';
const startTime = Date.now();

// For proxy mode: pending proxy requests
const pendingProxyRequests = new Map<
  string,
  {
    resolve: (response: OpenAIProxyResponse['payload']) => void;
    reject: (error: Error) => void;
  }
>();

// Active socket for sending proxy requests back to Host
let activeSocket: net.Socket | null = null;

/**
 * Create proxy function for inference module
 * This sends OPENAI_PROXY_REQUEST to Host and waits for response
 */
function createProxyFunction(): OpenAIProxyFunction {
  return async (request) => {
    return new Promise((resolve, reject) => {
      if (!activeSocket) {
        reject(new Error('No active connection to Host'));
        return;
      }

      // Store pending request
      pendingProxyRequests.set(request.proxyRequestId, { resolve, reject });

      // Send proxy request to Host
      const proxyRequest: OpenAIProxyRequest = {
        type: 'OPENAI_PROXY_REQUEST',
        requestId: request.proxyRequestId,
        success: true, // This is a request, success field required by base type
        payload: {
          proxyRequestId: request.proxyRequestId,
          model: request.model,
          prompt: request.prompt,
          maxTokens: request.maxTokens,
          temperature: request.temperature,
        },
      };

      console.log(`[Enclave] Sending OPENAI_PROXY_REQUEST to Host (${request.proxyRequestId})`);
      activeSocket.write(JSON.stringify(proxyRequest) + '\n');

      // Timeout after 60 seconds
      setTimeout(() => {
        if (pendingProxyRequests.has(request.proxyRequestId)) {
          pendingProxyRequests.delete(request.proxyRequestId);
          reject(new Error('Proxy request timeout'));
        }
      }, 60000);
    });
  };
}

/**
 * Handle OPENAI_PROXY_RESPONSE from Host
 */
function handleProxyResponse(response: OpenAIProxyResponse): void {
  const proxyRequestId = response.payload.proxyRequestId;
  const pending = pendingProxyRequests.get(proxyRequestId);

  if (pending) {
    pendingProxyRequests.delete(proxyRequestId);
    pending.resolve(response.payload);
  } else {
    console.warn(`[Enclave] Received proxy response for unknown request: ${proxyRequestId}`);
  }
}

/**
 * Get attestation document
 *
 * In Nitro: reads from /dev/attestation/attestation_doc
 * In simulation: returns simulated attestation
 */
async function getAttestation(moduleId: string): Promise<ReturnType<typeof createSimulatedAttestation>> {
  if (isNitroMode()) {
    // TODO: Implement real attestation reading
    // const attestationDoc = await readAttestationDocument();
    // return parseAttestationDocument(attestationDoc);
    console.log('[Enclave] Real attestation not implemented yet, using simulated');
  }
  return createSimulatedAttestation(moduleId);
}

/**
 * Handle incoming request from Host
 */
async function handleRequest(request: EnclaveRequest): Promise<EnclaveResponse | null> {
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
            attestation: await getAttestation(MODULE_ID),
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

        // Execute inference (direct or proxy mode)
        const result = await executeInference(prompt, model);

        const response: ExecuteInferenceResponse = {
          type: 'INFERENCE_RESULT',
          requestId: request.requestId,
          success: true,
          payload: {
            result: result.result,
            resultHash: result.resultHash,
            executionTimeMs: result.executionTimeMs,
            attestation: await getAttestation(MODULE_ID),
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

      case 'OPENAI_PROXY_RESPONSE': {
        // This is a response from Host for our proxy request
        handleProxyResponse(request as unknown as OpenAIProxyResponse);
        return null; // No response needed, this completes a pending request
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
 * Handle socket connection from Host
 */
function handleConnection(socket: net.Socket): void {
  console.log('[Enclave] Host connected');
  activeSocket = socket;

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

        // Only send response if one was generated (proxy responses don't need a reply)
        if (response) {
          socket.write(JSON.stringify(response) + '\n');
        }
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
    console.log('[Enclave] Host disconnected');
    activeSocket = null;

    // Reject all pending proxy requests
    for (const [id, pending] of pendingProxyRequests) {
      pending.reject(new Error('Connection closed'));
    }
    pendingProxyRequests.clear();
  });

  socket.on('error', (err) => {
    console.error('[Enclave] Socket error:', err);
  });
}

/**
 * Start the Enclave server
 */
async function startEnclave(): Promise<void> {
  const useVsock = isVsockMode();
  const useProxy = useOpenAIProxy();
  const useLocalLLM = process.env.USE_LOCAL_LLM === 'true';

  // Determine inference mode description
  let inferenceDesc: string;
  if (useLocalLLM) {
    inferenceDesc = 'Local LLM (Privacy Protected)';
  } else if (useProxy) {
    inferenceDesc = 'Proxy (via Host)';
  } else {
    inferenceDesc = 'Direct OpenAI';
  }

  console.log('========================================');
  console.log('  Baram TEE Enclave');
  console.log('========================================');
  console.log(`Protocol Version: ${PROTOCOL_VERSION}`);
  console.log(`Module ID: ${MODULE_ID}`);
  console.log(`Transport: ${useVsock ? 'vsock (Nitro)' : 'TCP (Simulation)'}`);
  console.log(`Inference Mode: ${inferenceDesc}`);
  console.log('');

  // Initialize crypto
  const publicKey = await initializeCrypto();
  console.log(`[Enclave] Public key ready (${publicKey.substring(0, 20)}...)`);

  // Initialize inference based on mode
  if (useLocalLLM) {
    // Local LLM mode: Run inference entirely within the Enclave
    // Prompts NEVER leave the TEE - complete privacy protection
    const modelPath = process.env.MODEL_PATH || '/app/models/llama-3.2-3b-instruct-q4_k_m.gguf';
    console.log(`[Enclave] Loading local LLM from ${modelPath}...`);
    await initializeInferenceLocal({ modelPath });
    console.log('[Enclave] Local LLM ready - prompts are privacy protected');
  } else if (useProxy) {
    // Proxy mode: Host will call OpenAI for us
    initializeInferenceProxy(createProxyFunction());
  } else {
    // Direct mode: Enclave calls OpenAI directly
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error('[Enclave] ERROR: OPENAI_API_KEY environment variable not set');
      console.error('[Enclave] In Nitro mode, use USE_LOCAL_LLM=true or USE_OPENAI_PROXY=true');
      process.exit(1);
    }
    initializeInference(openaiKey);
  }

  // Start server
  if (useVsock) {
    // Nitro mode: use vsock abstraction
    const server = createVsockServer(ENCLAVE_PORT);

    server.on('connection', handleConnection);
    server.on('error', (err) => {
      console.error('[Enclave] Server error:', err);
    });

    await server.listen();
    console.log('[Enclave] Ready to receive requests from Host via vsock');

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n[Enclave] Shutting down...');
      destroyKeyPair();
      if (isInLocalMode()) {
        await unloadModel();
      }
      await server.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    // Simulation mode: use TCP
    const server = net.createServer(handleConnection);

    server.listen(ENCLAVE_PORT, '0.0.0.0', () => {
      console.log(`[Enclave] TCP server listening on 0.0.0.0:${ENCLAVE_PORT}`);
      console.log('[Enclave] Ready to receive requests from Host');
      console.log('');
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n[Enclave] Shutting down...');
      destroyKeyPair();
      if (isInLocalMode()) {
        await unloadModel();
      }
      server.close(() => {
        console.log('[Enclave] Server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

// Start the Enclave
startEnclave().catch((error) => {
  console.error('[Enclave] Fatal error:', error);
  process.exit(1);
});
