/**
 * WalletConnect v2 Types
 *
 * Type definitions for WalletConnect integration.
 */

import type { SignClientTypes, SessionTypes } from '@walletconnect/types';

/**
 * WalletConnect configuration
 */
export interface WalletConnectConfig {
  /** WalletConnect project ID (from cloud.walletconnect.com) */
  projectId: string;
  /** Wallet metadata */
  metadata: SignClientTypes.Metadata;
  /** Optional relay URL override */
  relayUrl?: string;
}

/**
 * Supported EVM request methods
 */
export type EVMMethod =
  | 'eth_sendTransaction'
  | 'eth_signTransaction'
  | 'eth_sign'
  | 'personal_sign'
  | 'eth_signTypedData'
  | 'eth_signTypedData_v4'
  | 'wallet_switchEthereumChain'
  | 'wallet_addEthereumChain';

/**
 * Supported Sui/Move request methods (custom namespace)
 */
export type SuiMethod =
  | 'sui_signTransaction'
  | 'sui_signAndExecuteTransaction'
  | 'sui_signMessage';

/**
 * All supported WalletConnect methods
 */
export type WCMethod = EVMMethod | SuiMethod;

/**
 * Session request from dApp
 */
export interface WCRequest {
  /** Request ID */
  id: number;
  /** Session topic */
  topic: string;
  /** Request method */
  method: WCMethod;
  /** Request parameters */
  params: unknown;
  /** Chain ID in CAIP-2 format (e.g., "eip155:1", "sui:devnet") */
  chainId: string;
}

/**
 * EVM transaction parameters
 */
export interface EVMTransactionParams {
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Transaction data (for contract calls) */
  data?: string;
  /** Value in wei (hex) */
  value?: string;
  /** Gas limit (hex) */
  gas?: string;
  /** Gas price (hex) */
  gasPrice?: string;
  /** Max fee per gas (EIP-1559) */
  maxFeePerGas?: string;
  /** Max priority fee per gas (EIP-1559) */
  maxPriorityFeePerGas?: string;
  /** Nonce (hex) */
  nonce?: string;
}

/**
 * Sui transaction parameters
 */
export interface SuiTransactionParams {
  /** Base64 encoded transaction bytes */
  transactionBlockBytes: string;
  /** Options for execution */
  options?: {
    showEffects?: boolean;
    showEvents?: boolean;
    showObjectChanges?: boolean;
  };
}

/**
 * WalletConnect state
 */
export interface WalletConnectState {
  /** Whether client is initialized */
  initialized: boolean;
  /** Whether client is currently initializing */
  initializing: boolean;
  /** Active sessions with dApps */
  sessions: SessionTypes.Struct[];
  /** Pending session proposals awaiting approval */
  pendingProposals: SignClientTypes.EventArguments['session_proposal'][];
  /** Pending requests awaiting user action */
  pendingRequests: WCRequest[];
  /** Current pairing URI for QR display */
  pairingUri: string | null;
  /** Last error */
  error: string | null;
}

/**
 * WalletConnect events
 */
export type WCEvent =
  | { type: 'initialized' }
  | { type: 'session_proposal'; proposal: SignClientTypes.EventArguments['session_proposal'] }
  | { type: 'session_request'; request: WCRequest }
  | { type: 'session_created'; session: SessionTypes.Struct }
  | { type: 'session_updated'; session: SessionTypes.Struct }
  | { type: 'session_deleted'; topic: string }
  | { type: 'error'; error: Error };

/**
 * Event listener callback
 */
export type WCEventListener = (event: WCEvent) => void;

/**
 * Parsed chain ID from CAIP-2 format
 */
export interface ParsedChainId {
  /** Namespace (eip155, sui, etc.) */
  namespace: string;
  /** Chain reference (chain ID number for EVM, network name for Sui) */
  reference: string;
}

/**
 * Session approval parameters
 */
export interface SessionApprovalParams {
  /** Proposal to approve */
  proposalId: number;
  /** EVM address to expose */
  evmAddress?: string;
  /** Sui address to expose */
  suiAddress?: string;
}

/**
 * dApp metadata from session
 */
export interface DAppMetadata {
  /** dApp name */
  name: string;
  /** dApp description */
  description: string;
  /** dApp URL */
  url: string;
  /** dApp icons */
  icons: string[];
}

/**
 * Get dApp metadata from session
 */
export function getDAppMetadata(session: SessionTypes.Struct): DAppMetadata {
  return {
    name: session.peer.metadata.name,
    description: session.peer.metadata.description,
    url: session.peer.metadata.url,
    icons: session.peer.metadata.icons,
  };
}

/**
 * Parse CAIP-2 chain ID
 */
export function parseChainId(caip2ChainId: string): ParsedChainId {
  const [namespace, reference] = caip2ChainId.split(':');
  return { namespace, reference };
}

/**
 * Format CAIP-10 account ID
 */
export function formatAccountId(
  namespace: string,
  chainReference: string,
  address: string
): string {
  return `${namespace}:${chainReference}:${address}`;
}
