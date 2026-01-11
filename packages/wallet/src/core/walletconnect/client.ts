/**
 * WalletConnect SignClient Wrapper
 *
 * Manages WalletConnect client lifecycle and provides
 * a simplified interface for session and request handling.
 */

import SignClient from '@walletconnect/sign-client';
import type { SignClientTypes, SessionTypes } from '@walletconnect/types';
import type {
  WalletConnectConfig,
  WCEvent,
  WCEventListener,
  WCRequest,
} from './types';

/**
 * WalletConnect client singleton
 */
class WalletConnectClientImpl {
  private client: SignClient | null = null;
  private listeners: Set<WCEventListener> = new Set();
  private initialized = false;
  private initializing = false;

  /**
   * Initialize WalletConnect client
   *
   * @param config - WalletConnect configuration
   * @throws Error if already initializing
   */
  async init(config: WalletConnectConfig): Promise<void> {
    if (this.initialized) {
      console.warn('[WalletConnect] Already initialized');
      return;
    }

    if (this.initializing) {
      throw new Error('WalletConnect is currently initializing');
    }

    this.initializing = true;

    try {
      this.client = await SignClient.init({
        projectId: config.projectId,
        metadata: config.metadata,
        relayUrl: config.relayUrl,
      });

      this.setupEventHandlers();
      this.initialized = true;
      this.emit({ type: 'initialized' });
    } catch (err) {
      this.initializing = false;
      const error = err instanceof Error ? err : new Error('Failed to initialize WalletConnect');
      this.emit({ type: 'error', error });
      throw error;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Check if client is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if client is initializing
   */
  isInitializing(): boolean {
    return this.initializing;
  }

  /**
   * Get underlying SignClient instance
   * @throws Error if not initialized
   */
  getClient(): SignClient {
    if (!this.client) {
      throw new Error('WalletConnect not initialized');
    }
    return this.client;
  }

  /**
   * Create a new pairing URI for QR code display
   *
   * @returns Pairing URI string
   */
  async createPairing(): Promise<string> {
    const client = this.getClient();
    const { uri } = await client.core.pairing.create();
    return uri;
  }

  /**
   * Connect to a dApp using pairing URI
   *
   * @param uri - WalletConnect pairing URI (wc:...)
   */
  async pair(uri: string): Promise<void> {
    const client = this.getClient();
    await client.pair({ uri });
  }

  /**
   * Approve a session proposal
   *
   * @param proposal - The session proposal to approve
   * @param namespaces - Approved namespaces with accounts
   * @returns The created session
   */
  async approveSession(
    proposal: SignClientTypes.EventArguments['session_proposal'],
    namespaces: SessionTypes.Namespaces
  ): Promise<SessionTypes.Struct> {
    const client = this.getClient();

    const { acknowledged } = await client.approve({
      id: proposal.id,
      namespaces,
    });

    // Wait for acknowledgment to get the full session
    const session = await acknowledged();

    this.emit({ type: 'session_created', session });

    return session;
  }

  /**
   * Reject a session proposal
   *
   * @param proposal - The session proposal to reject
   * @param reason - Optional rejection reason
   */
  async rejectSession(
    proposal: SignClientTypes.EventArguments['session_proposal'],
    reason?: string
  ): Promise<void> {
    const client = this.getClient();

    await client.reject({
      id: proposal.id,
      reason: {
        code: 4001,
        message: reason || 'User rejected the session',
      },
    });
  }

  /**
   * Respond to a request with a result
   *
   * @param topic - Session topic
   * @param id - Request ID
   * @param result - Result to send back
   */
  async respondRequest(topic: string, id: number, result: unknown): Promise<void> {
    const client = this.getClient();

    await client.respond({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        result,
      },
    });
  }

  /**
   * Reject a request with an error
   *
   * @param topic - Session topic
   * @param id - Request ID
   * @param error - Error to send back
   */
  async rejectRequest(topic: string, id: number, error?: Error): Promise<void> {
    const client = this.getClient();

    await client.respond({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        error: {
          code: error ? 4001 : 4100,
          message: error?.message || 'User rejected the request',
        },
      },
    });
  }

  /**
   * Disconnect a session
   *
   * @param topic - Session topic to disconnect
   */
  async disconnectSession(topic: string): Promise<void> {
    const client = this.getClient();

    await client.disconnect({
      topic,
      reason: {
        code: 6000,
        message: 'User disconnected',
      },
    });
  }

  /**
   * Get all active sessions
   */
  getSessions(): SessionTypes.Struct[] {
    if (!this.client) return [];
    return Object.values(this.client.session.getAll());
  }

  /**
   * Get a specific session by topic
   */
  getSession(topic: string): SessionTypes.Struct | undefined {
    if (!this.client) return undefined;
    return this.client.session.get(topic);
  }

  /**
   * Get all pending session proposals
   */
  getPendingProposals(): SignClientTypes.EventArguments['session_proposal'][] {
    if (!this.client) return [];
    // proposal.getAll returns Record<number, ProposalTypes.Struct>
    const proposals = this.client.proposal.getAll();
    // Convert to event format
    return Object.entries(proposals).map(([id, params]) => ({
      id: parseInt(id, 10),
      params,
    })) as SignClientTypes.EventArguments['session_proposal'][];
  }

  /**
   * Get all pending session requests
   */
  getPendingRequests(): WCRequest[] {
    if (!this.client) return [];
    const pending = this.client.getPendingSessionRequests();
    return pending.map((p) => ({
      id: p.id,
      topic: p.topic,
      method: p.params.request.method as WCRequest['method'],
      params: p.params.request.params,
      chainId: p.params.chainId,
    }));
  }

  /**
   * Subscribe to WalletConnect events
   *
   * @param callback - Event callback
   * @returns Unsubscribe function
   */
  subscribe(callback: WCEventListener): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Clean up and disconnect
   */
  async destroy(): Promise<void> {
    if (this.client) {
      // Disconnect all sessions
      const sessions = this.getSessions();
      for (const session of sessions) {
        try {
          await this.disconnectSession(session.topic);
        } catch {
          // Ignore errors during cleanup
        }
      }
    }

    this.client = null;
    this.initialized = false;
    this.listeners.clear();
  }

  /**
   * Set up event handlers for the SignClient
   */
  private setupEventHandlers(): void {
    if (!this.client) return;

    // Session proposal (new connection request from dApp)
    this.client.on('session_proposal', (proposal) => {
      this.emit({ type: 'session_proposal', proposal });
    });

    // Session request (sign/send request from dApp)
    this.client.on('session_request', (event) => {
      const request: WCRequest = {
        id: event.id,
        topic: event.topic,
        method: event.params.request.method as WCRequest['method'],
        params: event.params.request.params,
        chainId: event.params.chainId,
      };
      this.emit({ type: 'session_request', request });
    });

    // Session deleted (dApp disconnected)
    this.client.on('session_delete', (event) => {
      this.emit({ type: 'session_deleted', topic: event.topic });
    });

    // Session updated
    this.client.on('session_update', (event) => {
      const session = this.client?.session.get(event.topic);
      if (session) {
        this.emit({ type: 'session_updated', session });
      }
    });

    // Session expired
    this.client.on('session_expire', (event) => {
      this.emit({ type: 'session_deleted', topic: event.topic });
    });
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: WCEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[WalletConnect] Event listener error:', err);
      }
    }
  }
}

/**
 * Singleton instance of WalletConnect client
 */
export const WalletConnectClient = new WalletConnectClientImpl();
