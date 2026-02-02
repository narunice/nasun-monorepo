/**
 * useWalletConnect Hook
 *
 * React hook for WalletConnect v2 integration.
 * Manages sessions, handles proposals and requests.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SessionTypes } from '@walletconnect/types';
import {
  WalletConnectClient,
  handleWCRequest,
  buildSessionNamespaces,
  canSatisfyProposal,
  getDAppMetadata,
} from '../core/walletconnect';
import type {
  WalletConnectConfig,
  WalletConnectState,
  WCRequest,
  WCEvent,
  DAppMetadata,
} from '../core/walletconnect/types';
import { useSigner } from './useSigner';
import { SignerManager } from '../core/signer/SignerManager';

/**
 * Result of useWalletConnect hook
 */
export interface UseWalletConnectResult {
  /** Current WalletConnect state */
  state: WalletConnectState;
  /** Initialize WalletConnect with config */
  init: (config: WalletConnectConfig) => Promise<void>;
  /** Create a pairing URI for QR code display */
  createPairing: () => Promise<string>;
  /** Connect to a dApp using pairing URI */
  pair: (uri: string) => Promise<void>;
  /** Approve a pending session proposal */
  approveSession: (proposalId: number) => Promise<SessionTypes.Struct>;
  /** Reject a pending session proposal */
  rejectSession: (proposalId: number, reason?: string) => Promise<void>;
  /** Approve and execute a pending request */
  approveRequest: (request: WCRequest) => Promise<unknown>;
  /** Reject a pending request */
  rejectRequest: (request: WCRequest, error?: Error) => Promise<void>;
  /** Disconnect a session */
  disconnect: (topic: string) => Promise<void>;
  /** Disconnect all sessions */
  disconnectAll: () => Promise<void>;
  /** Get dApp metadata for a session */
  getSessionMetadata: (topic: string) => DAppMetadata | null;
}

const initialState: WalletConnectState = {
  initialized: false,
  initializing: false,
  sessions: [],
  pendingProposals: [],
  pendingRequests: [],
  pairingUri: null,
  error: null,
};

/**
 * WalletConnect hook for managing dApp connections
 *
 * @example
 * ```tsx
 * const { state, init, createPairing, approveSession, approveRequest } = useWalletConnect();
 *
 * // Initialize on mount
 * useEffect(() => {
 *   init({
 *     projectId: 'your-project-id',
 *     metadata: {
 *       name: 'Nasun Wallet',
 *       description: 'Multi-chain wallet',
 *       url: 'https://nasun.io',
 *       icons: ['https://nasun.io/icon.png'],
 *     },
 *   });
 * }, [init]);
 *
 * // Handle pending proposals
 * useEffect(() => {
 *   if (state.pendingProposals.length > 0) {
 *     // Show approval UI
 *   }
 * }, [state.pendingProposals]);
 * ```
 */
export function useWalletConnect(): UseWalletConnectResult {
  const { hasSigner } = useSigner();
  const [state, setState] = useState<WalletConnectState>(initialState);
  const initializingRef = useRef(false);

  // Subscribe to WalletConnect events
  useEffect(() => {
    const unsubscribe = WalletConnectClient.subscribe((event: WCEvent) => {
      switch (event.type) {
        case 'initialized':
          setState((prev) => ({
            ...prev,
            initialized: true,
            initializing: false,
            sessions: WalletConnectClient.getSessions(),
          }));
          break;

        case 'session_proposal':
          setState((prev) => ({
            ...prev,
            pendingProposals: [...prev.pendingProposals, event.proposal],
          }));
          break;

        case 'session_request':
          setState((prev) => ({
            ...prev,
            pendingRequests: [...prev.pendingRequests, event.request],
          }));
          break;

        case 'session_created':
          setState((prev) => ({
            ...prev,
            sessions: [...prev.sessions, event.session],
          }));
          break;

        case 'session_updated':
          setState((prev) => ({
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.topic === event.session.topic ? event.session : s
            ),
          }));
          break;

        case 'session_deleted':
          setState((prev) => ({
            ...prev,
            sessions: prev.sessions.filter((s) => s.topic !== event.topic),
          }));
          break;

        case 'error':
          setState((prev) => ({
            ...prev,
            error: event.error.message,
            initializing: false,
          }));
          break;
      }
    });

    // Sync initial state if already initialized
    if (WalletConnectClient.isInitialized()) {
      setState((prev) => ({
        ...prev,
        initialized: true,
        sessions: WalletConnectClient.getSessions(),
        pendingProposals: WalletConnectClient.getPendingProposals(),
        pendingRequests: WalletConnectClient.getPendingRequests(),
      }));
    }

    return unsubscribe;
  }, []);

  /**
   * Initialize WalletConnect
   */
  const init = useCallback(async (config: WalletConnectConfig) => {
    if (initializingRef.current || WalletConnectClient.isInitialized()) {
      return;
    }

    initializingRef.current = true;
    setState((prev) => ({ ...prev, initializing: true, error: null }));

    try {
      await WalletConnectClient.init(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize';
      setState((prev) => ({
        ...prev,
        initializing: false,
        error: message,
      }));
      throw err;
    } finally {
      initializingRef.current = false;
    }
  }, []);

  /**
   * Create pairing URI
   */
  const createPairing = useCallback(async () => {
    const uri = await WalletConnectClient.createPairing();
    setState((prev) => ({ ...prev, pairingUri: uri }));
    return uri;
  }, []);

  /**
   * Pair with dApp
   */
  const pair = useCallback(async (uri: string) => {
    await WalletConnectClient.pair(uri);
  }, []);

  /**
   * Approve session proposal
   */
  const approveSession = useCallback(
    async (proposalId: number): Promise<SessionTypes.Struct> => {
      const proposal = state.pendingProposals.find((p) => p.id === proposalId);
      if (!proposal) {
        throw new Error('Proposal not found');
      }

      // Check if we have the required signers
      const hasEvm = hasSigner('evm');
      const hasSui = hasSigner('local') || hasSigner('zklogin');

      const { canSatisfy, missingNamespaces } = canSatisfyProposal(
        proposal.params.requiredNamespaces,
        hasEvm,
        hasSui
      );

      if (!canSatisfy) {
        throw new Error(`Missing signers for namespaces: ${missingNamespaces.join(', ')}`);
      }

      // Build namespaces based on available signers
      const evmSigner = SignerManager.get('evm');
      const suiSigner = SignerManager.get('local') || SignerManager.get('zklogin');

      const namespaces = buildSessionNamespaces(
        evmSigner?.address,
        suiSigner?.address
      );

      const session = await WalletConnectClient.approveSession(proposal, namespaces);

      // Remove from pending
      setState((prev) => ({
        ...prev,
        pendingProposals: prev.pendingProposals.filter((p) => p.id !== proposalId),
      }));

      return session;
    },
    [state.pendingProposals, hasSigner]
  );

  /**
   * Reject session proposal
   */
  const rejectSession = useCallback(
    async (proposalId: number, reason?: string) => {
      const proposal = state.pendingProposals.find((p) => p.id === proposalId);
      if (!proposal) {
        throw new Error('Proposal not found');
      }

      await WalletConnectClient.rejectSession(proposal, reason);

      setState((prev) => ({
        ...prev,
        pendingProposals: prev.pendingProposals.filter((p) => p.id !== proposalId),
      }));
    },
    [state.pendingProposals]
  );

  /**
   * Approve request
   */
  const approveRequest = useCallback(async (request: WCRequest): Promise<unknown> => {
    try {
      const result = await handleWCRequest(request);
      await WalletConnectClient.respondRequest(request.topic, request.id, result);

      setState((prev) => ({
        ...prev,
        pendingRequests: prev.pendingRequests.filter((r) => r.id !== request.id),
      }));

      return result;
    } catch (err) {
      // Remove from pending even on error
      setState((prev) => ({
        ...prev,
        pendingRequests: prev.pendingRequests.filter((r) => r.id !== request.id),
      }));
      throw err;
    }
  }, []);

  /**
   * Reject request
   */
  const rejectRequest = useCallback(async (request: WCRequest, error?: Error) => {
    await WalletConnectClient.rejectRequest(request.topic, request.id, error);

    setState((prev) => ({
      ...prev,
      pendingRequests: prev.pendingRequests.filter((r) => r.id !== request.id),
    }));
  }, []);

  /**
   * Disconnect session
   */
  const disconnect = useCallback(async (topic: string) => {
    await WalletConnectClient.disconnectSession(topic);

    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((s) => s.topic !== topic),
    }));
  }, []);

  /**
   * Disconnect all sessions
   */
  const disconnectAll = useCallback(async () => {
    const sessions = [...state.sessions];
    for (const session of sessions) {
      try {
        await WalletConnectClient.disconnectSession(session.topic);
      } catch {
        // Ignore individual disconnection errors
      }
    }

    setState((prev) => ({
      ...prev,
      sessions: [],
    }));
  }, [state.sessions]);

  /**
   * Get session metadata
   */
  const getSessionMetadata = useCallback(
    (topic: string): DAppMetadata | null => {
      const session = state.sessions.find((s) => s.topic === topic);
      if (!session) return null;
      return getDAppMetadata(session);
    },
    [state.sessions]
  );

  return {
    state,
    init,
    createPairing,
    pair,
    approveSession,
    rejectSession,
    approveRequest,
    rejectRequest,
    disconnect,
    disconnectAll,
    getSessionMetadata,
  };
}

/**
 * Hook to get connected dApps count
 */
export function useWalletConnectSessionCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      setCount(WalletConnectClient.getSessions().length);
    };

    updateCount();

    const unsubscribe = WalletConnectClient.subscribe((event) => {
      if (
        event.type === 'session_created' ||
        event.type === 'session_deleted' ||
        event.type === 'initialized'
      ) {
        updateCount();
      }
    });

    return unsubscribe;
  }, []);

  return count;
}

/**
 * Hook to check if WalletConnect is initialized
 */
export function useWalletConnectInitialized(): boolean {
  const [initialized, setInitialized] = useState(WalletConnectClient.isInitialized());

  useEffect(() => {
    if (WalletConnectClient.isInitialized()) {
      setInitialized(true);
      return;
    }

    const unsubscribe = WalletConnectClient.subscribe((event) => {
      if (event.type === 'initialized') {
        setInitialized(true);
      }
    });

    return unsubscribe;
  }, []);

  return initialized;
}
