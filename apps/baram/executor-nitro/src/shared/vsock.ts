/**
 * Vsock Abstraction Layer
 *
 * Provides a unified interface for TCP (local simulation) and vsock (AWS Nitro).
 *
 * Environment variables:
 * - USE_VSOCK=true: Use vsock for Nitro Enclave
 * - ENCLAVE_CID: Enclave CID (default: 16 for guest, or assigned by Nitro CLI)
 *
 * In AWS Nitro:
 * - Parent instance CID: 3 (VMADDR_CID_HOST)
 * - Enclave CID: 16+ (assigned by Nitro CLI, can be set with --enclave-cid)
 * - Uses AF_VSOCK socket family via node-vsock package
 *
 * In local simulation:
 * - Uses standard TCP sockets
 * - Same newline-delimited JSON protocol
 */

import * as net from 'net';
import { EventEmitter } from 'events';
import { ENCLAVE_PORT } from './protocol.js';

// Vsock CID constants (AWS Nitro specific)
export const VSOCK_CID_ANY = -1; // VMADDR_CID_ANY (for server binding)
export const VSOCK_CID_HYPERVISOR = 0; // VMADDR_CID_HYPERVISOR
export const VSOCK_CID_HOST = 3; // VMADDR_CID_HOST (parent instance in Nitro)
export const VSOCK_CID_GUEST_DEFAULT = 16; // Default guest CID (can vary)

/**
 * Check if we're running in vsock mode (Nitro Enclave)
 */
export function isVsockMode(): boolean {
  return process.env.USE_VSOCK === 'true';
}

/**
 * Get the Enclave CID from environment or default
 * In Nitro, the CID is assigned when running the enclave (--enclave-cid flag)
 */
export function getEnclaveCid(): number {
  const cid = process.env.ENCLAVE_CID;
  return cid ? parseInt(cid, 10) : VSOCK_CID_GUEST_DEFAULT;
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

// Import node-vsock types (dynamically loaded to avoid build errors on non-Linux)
type NodeVsockSocket = import('node-vsock').VsockSocket;

/**
 * VsockClientSocket - Unified client for TCP/vsock
 *
 * Automatically selects transport based on USE_VSOCK environment variable.
 */
export class VsockClientSocket extends EventEmitter {
  private tcpSocket: net.Socket | null = null;
  private vsockSocket: NodeVsockSocket | null = null;
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

    this.tcpSocket = net.createConnection({ host, port });

    this.tcpSocket.on('connect', () => {
      console.log('[Vsock] TCP connection established');
      resolve();
    });

    this.tcpSocket.on('data', (data) => {
      this.emit('data', data);
    });

    this.tcpSocket.on('close', () => {
      this.emit('close');
    });

    this.tcpSocket.on('error', (err) => {
      this.emit('error', err);
      if (!this.tcpSocket?.connecting) {
        reject(err);
      }
    });
  }

  /**
   * Connect using vsock (AWS Nitro)
   *
   * Uses node-vsock native binding for AF_VSOCK support.
   * Requires Linux kernel with vsock module loaded.
   */
  private async connectVsock(
    resolve: () => void,
    reject: (err: Error) => void
  ): Promise<void> {
    const cid = this.options.cid || getEnclaveCid();
    const port = this.options.port;

    console.log(`[Vsock] Connecting via vsock to CID ${cid}:${port}...`);

    try {
      // Dynamically import node-vsock (only available on Linux)
      const nodeVsock = await import('node-vsock');
      const VsockSocketClass = nodeVsock.VsockSocket;

      this.vsockSocket = new VsockSocketClass();

      this.vsockSocket.on('connect', () => {
        console.log('[Vsock] Vsock connection established');
        resolve();
      });

      this.vsockSocket.on('data', (data: Buffer) => {
        this.emit('data', data);
      });

      this.vsockSocket.on('end', () => {
        this.emit('close');
      });

      this.vsockSocket.on('error', (err: Error) => {
        this.emit('error', err);
        if (!this.vsockSocket?.connecting) {
          reject(err);
        }
      });

      // Initiate connection
      this.vsockSocket.connect(cid, port);
    } catch (error) {
      console.error('[Vsock] Failed to load node-vsock:', error);
      console.error('[Vsock] Install: npm install node-vsock');
      console.error('[Vsock] Note: node-vsock only works on Linux');
      console.error('[Vsock] For local testing, use TCP mode: unset USE_VSOCK');
      reject(new Error(`Vsock module not available: ${error}`));
    }
  }

  /**
   * Write data to the socket
   */
  write(data: string | Buffer): boolean {
    if (this.useVsock) {
      if (!this.vsockSocket) {
        throw new Error('Vsock not connected');
      }
      // node-vsock uses synchronous write
      if (typeof data === 'string') {
        this.vsockSocket.writeTextSync(data);
      } else {
        this.vsockSocket.writeSync(data);
      }
      return true;
    } else {
      if (!this.tcpSocket) {
        throw new Error('TCP socket not connected');
      }
      return this.tcpSocket.write(data);
    }
  }

  /**
   * Close the connection
   */
  end(): void {
    if (this.useVsock && this.vsockSocket) {
      this.vsockSocket.end();
      this.vsockSocket = null;
    } else if (this.tcpSocket) {
      this.tcpSocket.end();
      this.tcpSocket = null;
    }
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    if (this.useVsock) {
      return this.vsockSocket !== null && !this.vsockSocket.destroyed;
    }
    return this.tcpSocket !== null && !this.tcpSocket.destroyed;
  }
}

// Import node-vsock types (dynamically loaded)
type NodeVsockServer = import('node-vsock').VsockServer;

/**
 * VsockServer - Unified server for TCP/vsock
 *
 * Automatically selects transport based on USE_VSOCK environment variable.
 */
export class VsockServer extends EventEmitter {
  private tcpServer: net.Server | null = null;
  private vsockServer: NodeVsockServer | null = null;
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

    this.tcpServer = net.createServer((socket) => {
      this.emit('connection', socket);
    });

    this.tcpServer.on('error', (err) => {
      this.emit('error', err);
      reject(err);
    });

    this.tcpServer.listen(this.port, '0.0.0.0', () => {
      console.log(`[Vsock] TCP server listening on 0.0.0.0:${this.port}`);
      resolve();
    });
  }

  /**
   * Listen using vsock (AWS Nitro)
   *
   * In Nitro Enclave, the server listens on a port and accepts
   * connections from the parent instance (CID 3).
   *
   * Note: node-vsock's VsockServer binds to VMADDR_CID_ANY automatically.
   */
  private async listenVsock(
    resolve: () => void,
    reject: (err: Error) => void
  ): Promise<void> {
    console.log(`[Vsock] Starting vsock server on port ${this.port}...`);

    try {
      // Dynamically import node-vsock (only available on Linux)
      const nodeVsock = await import('node-vsock');
      const NodeVsockServerClass = nodeVsock.VsockServer;

      this.vsockServer = new NodeVsockServerClass();

      this.vsockServer.on('error', (err: Error) => {
        this.emit('error', err);
        reject(err);
      });

      this.vsockServer.on('connection', (socket: NodeVsockSocket) => {
        // Wrap the vsock socket in a compatible interface
        this.emit('connection', new VsockSocketWrapper(socket));
      });

      // Start listening on the port
      this.vsockServer.listen(this.port);

      // node-vsock doesn't have a callback for listen, resolve immediately
      console.log(`[Vsock] Vsock server listening on port ${this.port}`);
      resolve();
    } catch (error) {
      console.error('[Vsock] Failed to load node-vsock:', error);
      console.error('[Vsock] Install: npm install node-vsock');
      console.error('[Vsock] Note: node-vsock only works on Linux');
      console.error('[Vsock] For local testing, use TCP mode: unset USE_VSOCK');
      reject(new Error(`Vsock module not available: ${error}`));
    }
  }

  /**
   * Close the server
   */
  close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.useVsock && this.vsockServer) {
        this.vsockServer.close();
        console.log('[Vsock] Vsock server closed');
        resolve();
      } else if (this.tcpServer) {
        this.tcpServer.close(() => {
          console.log('[Vsock] TCP server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * Wrapper for node-vsock VsockSocket to provide net.Socket-like interface
 *
 * This wrapper ensures the vsock socket can be used with the same API
 * as TCP sockets in the Enclave message handler.
 */
class VsockSocketWrapper extends EventEmitter {
  private vsockSocket: NodeVsockSocket;

  constructor(vsockSocket: NodeVsockSocket) {
    super();
    this.vsockSocket = vsockSocket;

    // Forward events
    this.vsockSocket.on('data', (data: Buffer) => {
      this.emit('data', data);
    });

    this.vsockSocket.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.vsockSocket.on('end', () => {
      this.emit('close');
    });
  }

  /**
   * Write data to the socket
   */
  write(data: string | Buffer): boolean {
    if (typeof data === 'string') {
      this.vsockSocket.writeTextSync(data);
    } else {
      this.vsockSocket.writeSync(data);
    }
    return true;
  }

  /**
   * End the connection
   */
  end(): void {
    this.vsockSocket.end();
  }

  /**
   * Destroy the socket
   */
  destroy(): void {
    this.vsockSocket.destroy();
  }

  /**
   * Check if socket is destroyed
   */
  get destroyed(): boolean {
    return this.vsockSocket.destroyed;
  }

  /**
   * Set encoding (no-op for compatibility)
   */
  setEncoding(_encoding: string): void {
    // node-vsock always returns Buffer, encoding is handled at protocol level
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
