/**
 * Vsock Abstraction Layer
 *
 * Provides a unified interface for TCP (local simulation) and vsock (AWS Nitro).
 *
 * Environment variables:
 * - USE_VSOCK=true: Use vsock for Nitro Enclave
 * - ENCLAVE_CID: Enclave CID (default: 3 for guest)
 *
 * In AWS Nitro:
 * - Parent instance CID: 2
 * - Enclave CID: 3 (or assigned by Nitro CLI)
 * - Uses AF_VSOCK socket family
 *
 * In local simulation:
 * - Uses standard TCP sockets
 * - Same newline-delimited JSON protocol
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { ENCLAVE_PORT } from './protocol.js';

// Vsock CID constants
export const VSOCK_CID_ANY = -1; // VMADDR_CID_ANY
export const VSOCK_CID_HYPERVISOR = 0; // VMADDR_CID_HYPERVISOR
export const VSOCK_CID_HOST = 2; // VMADDR_CID_HOST (parent instance)
export const VSOCK_CID_GUEST = 3; // Default guest CID

/**
 * Check if we're running in vsock mode (Nitro Enclave)
 */
export function isVsockMode(): boolean {
  return process.env.USE_VSOCK === 'true';
}

/**
 * Get the Enclave CID from environment or default
 */
export function getEnclaveCid(): number {
  const cid = process.env.ENCLAVE_CID;
  return cid ? parseInt(cid, 10) : VSOCK_CID_GUEST;
}

/**
 * Connection options for unified client/server
 */
export interface VsockConnectionOptions {
  // TCP mode
  host?: string;
  port: number;
  // Vsock mode
  cid?: number;
}

/**
 * VsockClient - Unified client for TCP/vsock
 *
 * Automatically selects transport based on USE_VSOCK environment variable.
 */
export class VsockClientSocket extends EventEmitter {
  private socket: net.Socket | null = null;
  private options: VsockConnectionOptions;
  private useVsock: boolean;

  constructor(options: VsockConnectionOptions) {
    super();
    this.options = options;
    this.useVsock = isVsockMode();
  }

  /**
   * Connect to the Enclave
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.useVsock) {
        // AWS Nitro vsock mode
        this.connectVsock(resolve, reject);
      } else {
        // TCP simulation mode
        this.connectTcp(resolve, reject);
      }
    });
  }

  /**
   * Connect using TCP (local simulation)
   */
  private connectTcp(
    resolve: () => void,
    reject: (err: Error) => void
  ): void {
    const host = this.options.host || 'localhost';
    const port = this.options.port;

    console.log(`[Vsock] Connecting via TCP to ${host}:${port}...`);

    this.socket = net.createConnection({ host, port });

    this.socket.on('connect', () => {
      console.log('[Vsock] TCP connection established');
      resolve();
    });

    this.socket.on('data', (data) => {
      this.emit('data', data);
    });

    this.socket.on('close', () => {
      this.emit('close');
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
      if (!this.socket?.connecting) {
        reject(err);
      }
    });
  }

  /**
   * Connect using vsock (AWS Nitro)
   *
   * Uses the native vsock implementation.
   * Requires `vsock` kernel module and AF_VSOCK support.
   */
  private connectVsock(
    resolve: () => void,
    reject: (err: Error) => void
  ): void {
    const cid = this.options.cid || getEnclaveCid();
    const port = this.options.port;

    console.log(`[Vsock] Connecting via vsock to CID ${cid}:${port}...`);

    // In AWS Nitro, we use a custom vsock implementation
    // For now, we use a workaround via socat or native binding
    // Native vsock requires: npm install @aspect-build/vsock or custom binding
    try {
      // Try to load native vsock module
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vsock = require('@aspect-build/vsock');
      this.socket = vsock.connect(cid, port) as net.Socket;

      this.socket.on('connect', () => {
        console.log('[Vsock] Vsock connection established');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        this.emit('data', data);
      });

      this.socket.on('close', () => {
        this.emit('close');
      });

      this.socket.on('error', (err: Error) => {
        this.emit('error', err);
        reject(err);
      });
    } catch {
      // Fallback: try alternative vsock module or fail gracefully
      console.error('[Vsock] Native vsock module not available');
      console.error('[Vsock] Install: npm install @aspect-build/vsock');
      console.error('[Vsock] Or use TCP mode: unset USE_VSOCK');
      reject(new Error('Vsock module not available'));
    }
  }

  /**
   * Write data to the socket
   */
  write(data: string | Buffer): boolean {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    return this.socket.write(data);
  }

  /**
   * Close the connection
   */
  end(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }
}

/**
 * VsockServer - Unified server for TCP/vsock
 *
 * Automatically selects transport based on USE_VSOCK environment variable.
 */
export class VsockServer extends EventEmitter {
  private server: net.Server | null = null;
  private useVsock: boolean;
  private port: number;

  constructor(port: number = ENCLAVE_PORT) {
    super();
    this.port = port;
    this.useVsock = isVsockMode();
  }

  /**
   * Start listening for connections
   */
  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.useVsock) {
        this.listenVsock(resolve, reject);
      } else {
        this.listenTcp(resolve, reject);
      }
    });
  }

  /**
   * Listen using TCP (local simulation)
   */
  private listenTcp(
    resolve: () => void,
    reject: (err: Error) => void
  ): void {
    console.log(`[Vsock] Starting TCP server on port ${this.port}...`);

    this.server = net.createServer((socket) => {
      this.emit('connection', socket);
    });

    this.server.on('error', (err) => {
      this.emit('error', err);
      reject(err);
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`[Vsock] TCP server listening on 0.0.0.0:${this.port}`);
      resolve();
    });
  }

  /**
   * Listen using vsock (AWS Nitro)
   *
   * In Nitro Enclave, the server listens on VMADDR_CID_ANY (-1)
   * to accept connections from the parent instance.
   */
  private listenVsock(
    resolve: () => void,
    reject: (err: Error) => void
  ): void {
    console.log(`[Vsock] Starting vsock server on port ${this.port}...`);

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const vsock = require('@aspect-build/vsock');
      this.server = vsock.createServer((socket: net.Socket) => {
        this.emit('connection', socket);
      });

      this.server!.on('error', (err: Error) => {
        this.emit('error', err);
        reject(err);
      });

      // Listen on VMADDR_CID_ANY to accept from any CID
      this.server!.listen(this.port, VSOCK_CID_ANY, () => {
        console.log(`[Vsock] Vsock server listening on CID_ANY:${this.port}`);
        resolve();
      });
    } catch {
      console.error('[Vsock] Native vsock module not available');
      console.error('[Vsock] Install: npm install @aspect-build/vsock');
      console.error('[Vsock] Or use TCP mode: unset USE_VSOCK');
      reject(new Error('Vsock module not available'));
    }
  }

  /**
   * Close the server
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[Vsock] Server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Factory function to create a client socket
 */
export function createVsockClient(options?: Partial<VsockConnectionOptions>): VsockClientSocket {
  return new VsockClientSocket({
    host: options?.host || 'localhost',
    port: options?.port || ENCLAVE_PORT,
    cid: options?.cid || getEnclaveCid(),
  });
}

/**
 * Factory function to create a server
 */
export function createVsockServer(port?: number): VsockServer {
  return new VsockServer(port || ENCLAVE_PORT);
}
