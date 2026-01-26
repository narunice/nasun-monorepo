/**
 * Host Vsock Client
 *
 * Handles communication with the Enclave.
 *
 * Modes of operation:
 *
 * 1. Request-Response (both modes):
 *    - Host sends request (GET_PUBLIC_KEY, EXECUTE_INFERENCE, etc.)
 *    - Enclave sends response
 *
 * 2. OpenAI Proxy (Nitro mode only):
 *    - During EXECUTE_INFERENCE, Enclave may send OPENAI_PROXY_REQUEST
 *    - Host calls OpenAI API
 *    - Host sends OPENAI_PROXY_RESPONSE back to Enclave
 *    - Then Enclave sends final INFERENCE_RESULT
 *
 * Transport:
 * - TCP (local simulation): host:port
 * - vsock (AWS Nitro): CID:port
 */

import * as net from 'net';
import OpenAI from 'openai';
import {
  ENCLAVE_PORT,
  generateRequestId,
  useOpenAIProxy,
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
import { createVsockClient, VsockClientSocket, isVsockMode, getEnclaveCid } from '../shared/vsock.js';

/**
 * Connection configuration
 */
interface VsockClientConfig {
  host: string;
  port: number;
  cid?: number;
  timeout?: number; // Request timeout in ms
  openaiApiKey?: string; // For proxy mode
}

const DEFAULT_CONFIG: VsockClientConfig = {
  host: 'localhost',
  port: ENCLAVE_PORT,
  timeout: 120000, // 120 seconds for AI inference (includes proxy time)
};

/**
 * VsockClient - communicates with the Enclave
 */
export class VsockClient {
  private config: VsockClientConfig;
  private socket: net.Socket | VsockClientSocket | null = null;
  private pendingRequests: Map<
    string,
    {
      resolve: (response: EnclaveResponse) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();
  private buffer = '';
  private connected = false;
  private openaiClient: OpenAI | null = null;
  private useProxy: boolean;

  constructor(config: Partial<VsockClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.useProxy = useOpenAIProxy();

    // Initialize OpenAI client for proxy mode
    if (this.useProxy) {
      const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        console.warn('[Host/Vsock] OpenAI API key not provided for proxy mode');
      } else {
        this.openaiClient = new OpenAI({ apiKey });
        console.log('[Host/Vsock] OpenAI client initialized for proxy mode');
      }
    }
  }

  /**
   * Connect to the Enclave
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
      if (isVsockMode()) {
        // Nitro mode: use vsock abstraction
        const cid = this.config.cid || getEnclaveCid();
        console.log(`[Host/Vsock] Connecting to Enclave via vsock CID ${cid}:${this.config.port}...`);

        const vsockSocket = createVsockClient({
          cid,
          port: this.config.port,
        });

        vsockSocket.connect().then(() => {
          console.log('[Host/Vsock] Connected to Enclave via vsock');
          this.socket = vsockSocket as unknown as net.Socket;
          this.connected = true;
          this.setupSocketHandlers();
          resolve();
        }).catch(reject);
      } else {
        // Simulation mode: use TCP
        console.log(`[Host/Vsock] Connecting to Enclave at ${this.config.host}:${this.config.port}...`);

        this.socket = net.createConnection({
          host: this.config.host,
          port: this.config.port,
        });

        this.socket.on('connect', () => {
          console.log('[Host/Vsock] Connected to Enclave');
          this.connected = true;
          resolve();
        });

        this.setupSocketHandlers();

        this.socket.on('error', (err) => {
          console.error('[Host/Vsock] Connection error:', err.message);
          if (!this.connected) {
            reject(err);
          }
        });
      }
    });
  }

  /**
   * Set up socket event handlers
   */
  private setupSocketHandlers(): void {
    if (!this.socket) return;

    this.socket.on('data', (data: Buffer) => {
      this.handleData(data);
    });

    this.socket.on('close', () => {
      console.log('[Host/Vsock] Disconnected from Enclave');
      this.connected = false;
      this.socket = null;
      // Reject all pending requests
      for (const [requestId, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Connection closed'));
      }
      this.pendingRequests.clear();
    });
  }

  /**
   * Handle incoming data from Enclave
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Check for complete message (newline-delimited JSON)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);

        // Check if this is a proxy request from Enclave
        if (message.type === 'OPENAI_PROXY_REQUEST') {
          this.handleProxyRequest(message as OpenAIProxyRequest);
          continue;
        }

        // Otherwise, it's a response to our request
        const response: EnclaveResponse = message;
        const pending = this.pendingRequests.get(response.requestId);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.requestId);
          pending.resolve(response);
        } else {
          console.warn(`[Host/Vsock] Received response for unknown request: ${response.requestId}`);
        }
      } catch (error) {
        console.error('[Host/Vsock] Failed to parse message:', error);
      }
    }
  }

  /**
   * Handle OPENAI_PROXY_REQUEST from Enclave
   */
  private async handleProxyRequest(request: OpenAIProxyRequest): Promise<void> {
    const { proxyRequestId, model, prompt, maxTokens, temperature } = request.payload;

    console.log(`[Host/Vsock] Received proxy request ${proxyRequestId} for model ${model}`);

    let response: OpenAIProxyResponse;

    if (!this.openaiClient) {
      response = {
        type: 'OPENAI_PROXY_RESPONSE',
        requestId: proxyRequestId,
        payload: {
          proxyRequestId,
          success: false,
          error: 'OpenAI client not initialized on Host',
        },
      };
    } else {
      try {
        console.log(`[Host/Vsock] Calling OpenAI API...`);

        const completion = await this.openaiClient.chat.completions.create({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens || 1024,
          temperature: temperature || 0.7,
        });

        const result = completion.choices[0]?.message?.content || '';
        const usage = completion.usage;

        console.log(`[Host/Vsock] OpenAI response received (${result.length} chars)`);

        response = {
          type: 'OPENAI_PROXY_RESPONSE',
          requestId: proxyRequestId,
          payload: {
            proxyRequestId,
            success: true,
            result,
            usage: usage
              ? {
                  promptTokens: usage.prompt_tokens,
                  completionTokens: usage.completion_tokens,
                  totalTokens: usage.total_tokens,
                }
              : undefined,
          },
        };
      } catch (error) {
        console.error('[Host/Vsock] OpenAI API call failed:', error);
        response = {
          type: 'OPENAI_PROXY_RESPONSE',
          requestId: proxyRequestId,
          payload: {
            proxyRequestId,
            success: false,
            error: error instanceof Error ? error.message : 'OpenAI API call failed',
          },
        };
      }
    }

    // Send response back to Enclave
    if (this.socket) {
      this.socket.write(JSON.stringify(response) + '\n');
    }
  }

  /**
   * Send a request to the Enclave and wait for response
   */
  private async sendRequest<T extends EnclaveResponse>(request: EnclaveRequest): Promise<T> {
    if (!this.connected || !this.socket) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject(new Error(`Request timeout: ${request.type}`));
      }, this.config.timeout);

      this.pendingRequests.set(request.requestId, {
        resolve: resolve as (response: EnclaveResponse) => void,
        reject,
        timeout,
      });

      this.socket!.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Get the Enclave's public key
   */
  async getPublicKey(): Promise<GetPublicKeyResponse> {
    const request: GetPublicKeyRequest = {
      type: 'GET_PUBLIC_KEY',
      requestId: generateRequestId(),
      payload: {},
    };

    const response = await this.sendRequest<GetPublicKeyResponse>(request);

    if (!response.success) {
      throw new Error(response.error || 'Failed to get public key');
    }

    return response;
  }

  /**
   * Execute AI inference with encrypted prompt
   *
   * Note: In proxy mode, this may take longer as it involves:
   * 1. Sending request to Enclave
   * 2. Enclave decrypts prompt
   * 3. Enclave sends OPENAI_PROXY_REQUEST to Host
   * 4. Host calls OpenAI
   * 5. Host sends OPENAI_PROXY_RESPONSE to Enclave
   * 6. Enclave generates hash and attestation
   * 7. Enclave sends INFERENCE_RESULT
   */
  async executeInference(
    encryptedPrompt: string,
    model: string,
    onChainRequestId: number
  ): Promise<ExecuteInferenceResponse> {
    const request: ExecuteInferenceRequest = {
      type: 'EXECUTE_INFERENCE',
      requestId: generateRequestId(),
      payload: {
        encryptedPrompt,
        model,
        requestId: onChainRequestId,
      },
    };

    const response = await this.sendRequest<ExecuteInferenceResponse>(request);

    if (!response.success) {
      throw new Error(response.error || 'Inference failed');
    }

    return response;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const request: HealthCheckRequest = {
      type: 'HEALTH_CHECK',
      requestId: generateRequestId(),
      payload: {},
    };

    const response = await this.sendRequest<HealthCheckResponse>(request);

    if (!response.success) {
      throw new Error(response.error || 'Health check failed');
    }

    return response;
  }

  /**
   * Disconnect from the Enclave
   */
  disconnect(): void {
    if (this.socket) {
      if ('end' in this.socket) {
        this.socket.end();
      }
      this.socket = null;
      this.connected = false;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if running in proxy mode
   */
  isProxyMode(): boolean {
    return this.useProxy;
  }
}

// Singleton instance
let client: VsockClient | null = null;

/**
 * Get or create the vsock client instance
 */
export function getVsockClient(config?: Partial<VsockClientConfig>): VsockClient {
  if (!client) {
    client = new VsockClient(config);
  }
  return client;
}

/**
 * Reset the client (for testing)
 */
export function resetVsockClient(): void {
  if (client) {
    client.disconnect();
    client = null;
  }
}
