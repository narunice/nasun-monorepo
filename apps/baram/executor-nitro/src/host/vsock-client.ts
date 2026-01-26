/**
 * Host vsock Client
 *
 * Handles communication with the Enclave.
 *
 * In production AWS Nitro:
 * - Uses vsock (virtual socket) to communicate with Enclave
 * - Enclave is addressed by CID (Context ID)
 *
 * In local simulation:
 * - Uses TCP socket
 * - Enclave is addressed by host:port
 */

import * as net from 'net';
import {
  ENCLAVE_PORT,
  generateRequestId,
  type EnclaveRequest,
  type EnclaveResponse,
  type GetPublicKeyRequest,
  type GetPublicKeyResponse,
  type ExecuteInferenceRequest,
  type ExecuteInferenceResponse,
  type HealthCheckRequest,
  type HealthCheckResponse,
} from '../shared/protocol.js';

/**
 * Connection configuration
 */
interface VsockClientConfig {
  host: string;
  port: number;
  timeout?: number; // Request timeout in ms
}

const DEFAULT_CONFIG: VsockClientConfig = {
  host: 'localhost',
  port: ENCLAVE_PORT,
  timeout: 60000, // 60 seconds for AI inference
};

/**
 * VsockClient - communicates with the Enclave
 */
export class VsockClient {
  private config: VsockClientConfig;
  private socket: net.Socket | null = null;
  private pendingRequests: Map<string, {
    resolve: (response: EnclaveResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private buffer = '';
  private connected = false;

  constructor(config: Partial<VsockClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to the Enclave
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket) {
      return;
    }

    return new Promise((resolve, reject) => {
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

      this.socket.on('data', (data) => {
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

      this.socket.on('error', (err) => {
        console.error('[Host/Vsock] Connection error:', err.message);
        if (!this.connected) {
          reject(err);
        }
      });
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
        const response: EnclaveResponse = JSON.parse(line);
        const pending = this.pendingRequests.get(response.requestId);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(response.requestId);
          pending.resolve(response);
        } else {
          console.warn(`[Host/Vsock] Received response for unknown request: ${response.requestId}`);
        }
      } catch (error) {
        console.error('[Host/Vsock] Failed to parse response:', error);
      }
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
      this.socket.end();
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
