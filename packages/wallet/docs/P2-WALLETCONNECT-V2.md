# WalletConnect v2 Implementation Plan

> Priority: P1 (Next)
> Dependencies: Signer Abstraction (COMPLETED), Multi-chain (COMPLETED)

---

## 1. Overview

### 1.1. What is WalletConnect v2?

WalletConnect v2 is a protocol for connecting wallets to dApps. It enables:
- **Wallet Mode**: Nasun Wallet acts as a wallet that dApps can connect to
- **dApp Mode**: Nasun dApps can accept connections from external wallets

### 1.2. Use Cases

| Use Case | Mode | Example |
|----------|------|---------|
| Connect Nasun Wallet to Uniswap | Wallet | Sign transactions on Uniswap with Nasun Wallet |
| Connect MetaMask to Pado | dApp | Use MetaMask to trade on Pado |
| Mobile Nasun Wallet (future) | Wallet | Scan QR to connect to web dApps |

### 1.3. Supported Chains

WalletConnect will support all chains in our registry:
- **EVM**: Ethereum, Base, Arbitrum, testnets
- **Move**: Nasun Devnet (via custom namespace)

---

## 2. Architecture

### 2.1. Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     @nasun/wallet                            │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  WalletConnect Core                    │  │
│  │                                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │   Client    │  │   Session   │  │   Request    │  │  │
│  │  │   Manager   │  │   Store     │  │   Handler    │  │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘  │  │
│  │         │               │                │            │  │
│  │         └───────────────┼────────────────┘            │  │
│  │                         │                             │  │
│  │                  ┌──────┴──────┐                      │  │
│  │                  │  SignClient │                      │  │
│  │                  │  (WC SDK)   │                      │  │
│  │                  └─────────────┘                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│                  ┌──────┴──────┐                           │
│                  │  useSigner  │                           │
│                  └─────────────┘                           │
│                         │                                   │
│         ┌───────────────┼───────────────┐                  │
│         │               │               │                  │
│   LocalSigner     EVMSigner      ZkLoginSigner            │
└─────────────────────────────────────────────────────────────┘
```

### 2.2. Module Structure

```
packages/wallet/src/
├── core/
│   └── walletconnect/
│       ├── client.ts        # SignClient wrapper
│       ├── session.ts       # Session management
│       ├── handlers.ts      # Request handlers (sign, sendTx)
│       ├── namespaces.ts    # Chain namespace definitions
│       ├── storage.ts       # Session persistence
│       ├── types.ts         # WC-specific types
│       └── index.ts         # Exports
├── hooks/
│   ├── useWalletConnect.ts  # Main WC hook
│   └── useWCSession.ts      # Session management hook
└── index.ts                 # Add WC exports
```

---

## 3. Dependencies

### 3.1. Required Packages

```json
{
  "dependencies": {
    "@walletconnect/sign-client": "^2.17.0",
    "@walletconnect/types": "^2.17.0",
    "@walletconnect/utils": "^2.17.0"
  }
}
```

### 3.2. Peer Dependencies (already installed)
- `viem` - EVM transaction encoding
- `@tanstack/react-query` - Async state management

---

## 4. Implementation Steps

### Step 1: Add Dependencies

```bash
cd packages/wallet
pnpm add @walletconnect/sign-client @walletconnect/types @walletconnect/utils
```

### Step 2: Define Types

**File**: `core/walletconnect/types.ts`

```typescript
import type { SignClientTypes, SessionTypes } from '@walletconnect/types';

/** WalletConnect configuration */
export interface WalletConnectConfig {
  /** WalletConnect project ID (from cloud.walletconnect.com) */
  projectId: string;
  /** Wallet metadata */
  metadata: SignClientTypes.Metadata;
  /** Optional relay URL override */
  relayUrl?: string;
}

/** Supported request methods */
export type WCMethod =
  // EVM methods
  | 'eth_sendTransaction'
  | 'eth_signTransaction'
  | 'eth_sign'
  | 'personal_sign'
  | 'eth_signTypedData'
  | 'eth_signTypedData_v4'
  // Sui/Move methods (custom namespace)
  | 'sui_signTransaction'
  | 'sui_signAndExecuteTransaction'
  | 'sui_signMessage';

/** Session request payload */
export interface WCRequest {
  id: number;
  topic: string;
  method: WCMethod;
  params: unknown;
  chainId: string;
}

/** Request approval/rejection */
export interface WCRequestHandler {
  approve: (result: unknown) => Promise<void>;
  reject: (error?: Error) => Promise<void>;
}

/** WalletConnect state */
export interface WalletConnectState {
  /** Client initialization status */
  initialized: boolean;
  /** Active sessions */
  sessions: SessionTypes.Struct[];
  /** Pending session proposals */
  pendingProposals: SignClientTypes.EventArguments['session_proposal'][];
  /** Pending requests */
  pendingRequests: WCRequest[];
  /** Current pairing URI (for QR display) */
  pairingUri: string | null;
}

/** Events emitted by WalletConnect */
export type WCEvent =
  | { type: 'session_proposal'; proposal: SignClientTypes.EventArguments['session_proposal'] }
  | { type: 'session_request'; request: WCRequest }
  | { type: 'session_delete'; topic: string }
  | { type: 'session_update'; session: SessionTypes.Struct };
```

### Step 3: Define Chain Namespaces

**File**: `core/walletconnect/namespaces.ts`

```typescript
import { CHAINS, getEVMChains, getMoveChains } from '../../config/chains';

/** EIP-155 namespace for EVM chains */
export function buildEIP155Namespace(address: string): {
  chains: string[];
  methods: string[];
  events: string[];
  accounts: string[];
} {
  const evmChains = getEVMChains();
  const chainIds = evmChains.map((c) => `eip155:${c.chainId}`);
  const accounts = evmChains.map((c) => `eip155:${c.chainId}:${address}`);

  return {
    chains: chainIds,
    methods: [
      'eth_sendTransaction',
      'eth_signTransaction',
      'eth_sign',
      'personal_sign',
      'eth_signTypedData',
      'eth_signTypedData_v4',
    ],
    events: ['chainChanged', 'accountsChanged'],
    accounts,
  };
}

/** Custom namespace for Sui/Move chains */
export function buildSuiNamespace(address: string): {
  chains: string[];
  methods: string[];
  events: string[];
  accounts: string[];
} {
  // Using custom namespace for Sui
  // Format: sui:devnet, sui:mainnet
  const moveChains = getMoveChains();
  const chainIds = moveChains.map((c) => `sui:${c.id.replace('nasun-', '')}`);
  const accounts = moveChains.map((c) => `sui:${c.id.replace('nasun-', '')}:${address}`);

  return {
    chains: chainIds,
    methods: [
      'sui_signTransaction',
      'sui_signAndExecuteTransaction',
      'sui_signMessage',
    ],
    events: ['accountsChanged'],
    accounts,
  };
}

/** Build all supported namespaces */
export function buildNamespaces(evmAddress: string, suiAddress: string) {
  return {
    eip155: buildEIP155Namespace(evmAddress),
    sui: buildSuiNamespace(suiAddress),
  };
}

/** Parse chain ID from WC format */
export function parseChainId(wcChainId: string): {
  namespace: 'eip155' | 'sui';
  chainId: string | number;
} {
  const [namespace, id] = wcChainId.split(':');
  if (namespace === 'eip155') {
    return { namespace: 'eip155', chainId: parseInt(id, 10) };
  }
  return { namespace: 'sui', chainId: id };
}
```

### Step 4: Implement SignClient Wrapper

**File**: `core/walletconnect/client.ts`

```typescript
import SignClient from '@walletconnect/sign-client';
import type { SignClientTypes, SessionTypes } from '@walletconnect/types';
import type { WalletConnectConfig, WCEvent, WCRequest } from './types';

type EventCallback = (event: WCEvent) => void;

class WalletConnectClientImpl {
  private client: SignClient | null = null;
  private config: WalletConnectConfig | null = null;
  private listeners: Set<EventCallback> = new Set();
  private initialized = false;

  /**
   * Initialize WalletConnect client
   */
  async init(config: WalletConnectConfig): Promise<void> {
    if (this.initialized) return;

    this.config = config;

    this.client = await SignClient.init({
      projectId: config.projectId,
      metadata: config.metadata,
      relayUrl: config.relayUrl,
    });

    // Set up event handlers
    this.setupEventHandlers();

    this.initialized = true;
  }

  /**
   * Create pairing URI for QR code
   */
  async createPairing(): Promise<string> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    const { uri } = await this.client.core.pairing.create();
    return uri;
  }

  /**
   * Pair with dApp using URI
   */
  async pair(uri: string): Promise<void> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    await this.client.pair({ uri });
  }

  /**
   * Approve session proposal
   */
  async approveSession(
    proposal: SignClientTypes.EventArguments['session_proposal'],
    namespaces: SessionTypes.Namespaces
  ): Promise<SessionTypes.Struct> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    const { id, params } = proposal;

    const session = await this.client.approve({
      id,
      namespaces,
    });

    return session;
  }

  /**
   * Reject session proposal
   */
  async rejectSession(
    proposal: SignClientTypes.EventArguments['session_proposal'],
    reason?: string
  ): Promise<void> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    await this.client.reject({
      id: proposal.id,
      reason: {
        code: 4001,
        message: reason || 'User rejected',
      },
    });
  }

  /**
   * Respond to request with result
   */
  async respondRequest(topic: string, id: number, result: unknown): Promise<void> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    await this.client.respond({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        result,
      },
    });
  }

  /**
   * Reject request with error
   */
  async rejectRequest(topic: string, id: number, error?: Error): Promise<void> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    await this.client.respond({
      topic,
      response: {
        id,
        jsonrpc: '2.0',
        error: {
          code: 4001,
          message: error?.message || 'User rejected',
        },
      },
    });
  }

  /**
   * Disconnect session
   */
  async disconnectSession(topic: string): Promise<void> {
    if (!this.client) throw new Error('WalletConnect not initialized');

    await this.client.disconnect({
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
   * Subscribe to events
   */
  subscribe(callback: EventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    // Session proposal (new connection request)
    this.client.on('session_proposal', (proposal) => {
      this.emit({ type: 'session_proposal', proposal });
    });

    // Session request (sign/send transaction)
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

    // Session deleted
    this.client.on('session_delete', (event) => {
      this.emit({ type: 'session_delete', topic: event.topic });
    });

    // Session updated
    this.client.on('session_update', (event) => {
      const session = this.client?.session.get(event.topic);
      if (session) {
        this.emit({ type: 'session_update', session });
      }
    });
  }

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

export const WalletConnectClient = new WalletConnectClientImpl();
```

### Step 5: Implement Request Handlers

**File**: `core/walletconnect/handlers.ts`

```typescript
import type { WCRequest } from './types';
import { SignerManager } from '../signer/SignerManager';
import { EVMSigner } from '../signer/adapters/EVMSigner';
import { LocalSigner } from '../signer/adapters/LocalSigner';
import { parseChainId } from './namespaces';
import { getChainByEvmId, getChain } from '../../config/chains';
import { getEVMClient } from '../evm/client';
import { getSuiClient } from '../../sui/client';

/**
 * Handle WalletConnect request
 * Returns the result to send back to the dApp
 */
export async function handleWCRequest(request: WCRequest): Promise<unknown> {
  const { namespace, chainId } = parseChainId(request.chainId);

  if (namespace === 'eip155') {
    return handleEVMRequest(request, chainId as number);
  } else if (namespace === 'sui') {
    return handleSuiRequest(request, chainId as string);
  }

  throw new Error(`Unsupported namespace: ${namespace}`);
}

/**
 * Handle EVM requests
 */
async function handleEVMRequest(request: WCRequest, chainId: number): Promise<unknown> {
  const signer = SignerManager.get('evm');
  if (!signer || !(signer instanceof EVMSigner)) {
    throw new Error('EVM signer not available');
  }

  const chain = getChainByEvmId(chainId);
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const client = getEVMClient(chain);

  switch (request.method) {
    case 'personal_sign': {
      const [message, address] = request.params as [string, string];
      // Verify address matches
      if (address.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }
      const messageBytes = hexToBytes(message);
      const { signature } = await signer.signPersonal(messageBytes);
      return signature;
    }

    case 'eth_sign': {
      const [address, message] = request.params as [string, string];
      if (address.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }
      const messageBytes = hexToBytes(message);
      const { signature } = await signer.signPersonal(messageBytes);
      return signature;
    }

    case 'eth_signTypedData':
    case 'eth_signTypedData_v4': {
      const [address, typedData] = request.params as [string, string];
      if (address.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Address mismatch');
      }
      const parsed = JSON.parse(typedData);
      return await signer.signTypedData(parsed);
    }

    case 'eth_sendTransaction': {
      const [txParams] = request.params as [EVMTransactionParams];

      // Get nonce
      const nonce = await client.getTransactionCount({
        address: signer.address as `0x${string}`,
      });

      // Estimate gas if not provided
      const gas = txParams.gas ? BigInt(txParams.gas) : await client.estimateGas({
        account: signer.address as `0x${string}`,
        to: txParams.to as `0x${string}`,
        data: txParams.data as `0x${string}` | undefined,
        value: txParams.value ? BigInt(txParams.value) : undefined,
      });

      // Get gas price if not provided
      const gasPrice = txParams.gasPrice
        ? BigInt(txParams.gasPrice)
        : await client.getGasPrice();

      // Sign transaction
      const signedTx = await signer.signEVMTransaction({
        to: txParams.to as `0x${string}`,
        data: txParams.data as `0x${string}` | undefined,
        value: txParams.value ? BigInt(txParams.value) : undefined,
        gas,
        gasPrice,
        nonce,
      });

      // Send transaction
      const hash = await client.sendRawTransaction({
        serializedTransaction: signedTx,
      });

      return hash;
    }

    case 'eth_signTransaction': {
      const [txParams] = request.params as [EVMTransactionParams];

      const nonce = await client.getTransactionCount({
        address: signer.address as `0x${string}`,
      });

      const gas = txParams.gas ? BigInt(txParams.gas) : await client.estimateGas({
        account: signer.address as `0x${string}`,
        to: txParams.to as `0x${string}`,
        data: txParams.data as `0x${string}` | undefined,
        value: txParams.value ? BigInt(txParams.value) : undefined,
      });

      const gasPrice = txParams.gasPrice
        ? BigInt(txParams.gasPrice)
        : await client.getGasPrice();

      const signedTx = await signer.signEVMTransaction({
        to: txParams.to as `0x${string}`,
        data: txParams.data as `0x${string}` | undefined,
        value: txParams.value ? BigInt(txParams.value) : undefined,
        gas,
        gasPrice,
        nonce,
      });

      return signedTx;
    }

    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
}

/**
 * Handle Sui/Move requests
 */
async function handleSuiRequest(request: WCRequest, network: string): Promise<unknown> {
  const signer = SignerManager.get('local') || SignerManager.get('zklogin');
  if (!signer) {
    throw new Error('Sui signer not available');
  }

  const suiClient = getSuiClient();

  switch (request.method) {
    case 'sui_signTransaction': {
      const { transactionBlockBytes } = request.params as { transactionBlockBytes: string };
      const txBytes = new Uint8Array(Buffer.from(transactionBlockBytes, 'base64'));
      const { signature } = await signer.sign(txBytes);
      return { signature };
    }

    case 'sui_signAndExecuteTransaction': {
      const { transactionBlockBytes } = request.params as { transactionBlockBytes: string };
      const txBytes = new Uint8Array(Buffer.from(transactionBlockBytes, 'base64'));
      const { signature } = await signer.sign(txBytes);

      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true },
      });

      return result;
    }

    case 'sui_signMessage': {
      const { message } = request.params as { message: string };
      const messageBytes = new Uint8Array(Buffer.from(message, 'base64'));
      const { signature } = await signer.signPersonal(messageBytes);
      return { signature };
    }

    default:
      throw new Error(`Unsupported method: ${request.method}`);
  }
}

// Helper types
interface EVMTransactionParams {
  from: string;
  to: string;
  data?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
}

function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}
```

### Step 6: Implement React Hook

**File**: `hooks/useWalletConnect.ts`

```typescript
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SessionTypes } from '@walletconnect/types';
import { WalletConnectClient } from '../core/walletconnect/client';
import { handleWCRequest } from '../core/walletconnect/handlers';
import { buildNamespaces } from '../core/walletconnect/namespaces';
import { useSigner } from './useSigner';
import { useChain } from './useChain';
import type {
  WalletConnectConfig,
  WCRequest,
  WalletConnectState,
  WCEvent,
} from '../core/walletconnect/types';

export interface UseWalletConnectResult {
  /** WalletConnect state */
  state: WalletConnectState;
  /** Initialize WalletConnect */
  init: (config: WalletConnectConfig) => Promise<void>;
  /** Create pairing URI for QR code */
  createPairing: () => Promise<string>;
  /** Pair with dApp using URI */
  pair: (uri: string) => Promise<void>;
  /** Approve pending session proposal */
  approveSession: (proposalId: number) => Promise<void>;
  /** Reject pending session proposal */
  rejectSession: (proposalId: number, reason?: string) => Promise<void>;
  /** Approve pending request */
  approveRequest: (request: WCRequest) => Promise<void>;
  /** Reject pending request */
  rejectRequest: (request: WCRequest, error?: Error) => Promise<void>;
  /** Disconnect session */
  disconnect: (topic: string) => Promise<void>;
}

export function useWalletConnect(): UseWalletConnectResult {
  const { signer } = useSigner();
  const { chain } = useChain();

  const [state, setState] = useState<WalletConnectState>({
    initialized: false,
    sessions: [],
    pendingProposals: [],
    pendingRequests: [],
    pairingUri: null,
  });

  // Subscribe to WalletConnect events
  useEffect(() => {
    const unsubscribe = WalletConnectClient.subscribe((event: WCEvent) => {
      switch (event.type) {
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

        case 'session_delete':
          setState((prev) => ({
            ...prev,
            sessions: prev.sessions.filter((s) => s.topic !== event.topic),
          }));
          break;

        case 'session_update':
          setState((prev) => ({
            ...prev,
            sessions: prev.sessions.map((s) =>
              s.topic === event.session.topic ? event.session : s
            ),
          }));
          break;
      }
    });

    return unsubscribe;
  }, []);

  const init = useCallback(async (config: WalletConnectConfig) => {
    await WalletConnectClient.init(config);
    setState((prev) => ({
      ...prev,
      initialized: true,
      sessions: WalletConnectClient.getSessions(),
    }));
  }, []);

  const createPairing = useCallback(async () => {
    const uri = await WalletConnectClient.createPairing();
    setState((prev) => ({ ...prev, pairingUri: uri }));
    return uri;
  }, []);

  const pair = useCallback(async (uri: string) => {
    await WalletConnectClient.pair(uri);
  }, []);

  const approveSession = useCallback(async (proposalId: number) => {
    if (!signer) throw new Error('No signer available');

    const proposal = state.pendingProposals.find((p) => p.id === proposalId);
    if (!proposal) throw new Error('Proposal not found');

    // Build namespaces based on available signers
    // For now, use current signer address for both (simplified)
    const namespaces = buildNamespaces(signer.address, signer.address);

    const session = await WalletConnectClient.approveSession(proposal, namespaces);

    setState((prev) => ({
      ...prev,
      pendingProposals: prev.pendingProposals.filter((p) => p.id !== proposalId),
      sessions: [...prev.sessions, session],
    }));
  }, [signer, state.pendingProposals]);

  const rejectSession = useCallback(async (proposalId: number, reason?: string) => {
    const proposal = state.pendingProposals.find((p) => p.id === proposalId);
    if (!proposal) throw new Error('Proposal not found');

    await WalletConnectClient.rejectSession(proposal, reason);

    setState((prev) => ({
      ...prev,
      pendingProposals: prev.pendingProposals.filter((p) => p.id !== proposalId),
    }));
  }, [state.pendingProposals]);

  const approveRequest = useCallback(async (request: WCRequest) => {
    try {
      const result = await handleWCRequest(request);
      await WalletConnectClient.respondRequest(request.topic, request.id, result);
    } finally {
      setState((prev) => ({
        ...prev,
        pendingRequests: prev.pendingRequests.filter((r) => r.id !== request.id),
      }));
    }
  }, []);

  const rejectRequest = useCallback(async (request: WCRequest, error?: Error) => {
    await WalletConnectClient.rejectRequest(request.topic, request.id, error);
    setState((prev) => ({
      ...prev,
      pendingRequests: prev.pendingRequests.filter((r) => r.id !== request.id),
    }));
  }, []);

  const disconnect = useCallback(async (topic: string) => {
    await WalletConnectClient.disconnectSession(topic);
    setState((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((s) => s.topic !== topic),
    }));
  }, []);

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
  };
}
```

### Step 7: Update Exports

**File**: `index.ts` (additions)

```typescript
// ============================================
// WalletConnect v2 (P1)
// ============================================

// WalletConnect Hook
export { useWalletConnect } from './hooks/useWalletConnect';
export type { UseWalletConnectResult } from './hooks/useWalletConnect';

// WalletConnect Types
export type {
  WalletConnectConfig,
  WCMethod,
  WCRequest,
  WCRequestHandler,
  WalletConnectState,
  WCEvent,
} from './core/walletconnect/types';

// WalletConnect Client (for advanced usage)
export { WalletConnectClient } from './core/walletconnect/client';
```

---

## 5. Testing Plan

### 5.1. Unit Tests

```typescript
// __tests__/walletconnect/namespaces.test.ts
describe('WalletConnect Namespaces', () => {
  it('should build EIP155 namespace for EVM chains', () => {
    const ns = buildEIP155Namespace('0x1234...');
    expect(ns.chains).toContain('eip155:1');
    expect(ns.methods).toContain('eth_sendTransaction');
  });

  it('should build Sui namespace for Move chains', () => {
    const ns = buildSuiNamespace('0x1234...');
    expect(ns.chains).toContain('sui:devnet');
    expect(ns.methods).toContain('sui_signTransaction');
  });
});
```

### 5.2. Integration Tests

1. **Pairing Test**:
   - Generate pairing URI
   - Connect with external WC-compatible dApp
   - Verify session established

2. **Transaction Signing Test**:
   - Connect to test dApp
   - Request eth_sendTransaction
   - Verify transaction signed and sent

3. **Multi-chain Test**:
   - Connect with both EVM and Sui namespaces
   - Sign transactions on different chains

### 5.3. E2E Tests

```bash
# Start test dApp (external)
# Connect Nasun Wallet via WalletConnect
# Execute transaction flow
```

---

## 6. UI Components (wallet-ui)

After core implementation, create UI components in `@nasun/wallet-ui`:

```tsx
// WalletConnectButton - Show QR for pairing
<WalletConnectButton projectId="..." />

// SessionList - Show connected dApps
<WalletConnectSessions onDisconnect={...} />

// RequestModal - Approve/reject requests
<WalletConnectRequestModal request={...} onApprove={...} onReject={...} />
```

---

## 7. Security Considerations

1. **Origin Verification**: Verify dApp origin before approving sessions
2. **Transaction Preview**: Show transaction details before signing
3. **Rate Limiting**: Limit request frequency per session
4. **Session Expiry**: Auto-expire sessions after inactivity
5. **Namespace Validation**: Only approve requested namespaces that match available signers

---

## 8. Estimated Effort

| Step | Description | Complexity |
|------|-------------|------------|
| 1 | Add dependencies | Low |
| 2 | Define types | Low |
| 3 | Define namespaces | Medium |
| 4 | Implement client | High |
| 5 | Implement handlers | High |
| 6 | Implement hook | Medium |
| 7 | Update exports | Low |
| 8 | Write tests | Medium |
| 9 | UI components | Medium |

---

## 9. Post-Implementation

After WalletConnect v2:
1. **EVM Account Abstraction** - SmartAccountSigner with paymaster
2. **dApp Mode** - Accept external wallets in Nasun dApps
3. **Mobile Support** - Deep linking for mobile wallet
