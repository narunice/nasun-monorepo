/**
 * WalletConnect Chain Namespaces
 *
 * Defines supported chains and methods for WalletConnect sessions.
 * Uses CAIP-2 chain identifiers and CAIP-10 account identifiers.
 */

import type { ProposalTypes } from '@walletconnect/types';
import { getEVMChains, getMoveChains } from '../../config/chains';

/**
 * EVM namespace identifier (EIP-155)
 */
export const EIP155_NAMESPACE = 'eip155';

/**
 * Sui/Move namespace identifier (custom)
 */
export const SUI_NAMESPACE = 'sui';

/**
 * Supported EVM methods
 */
export const EVM_METHODS = [
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v4',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
] as const;

/**
 * Supported EVM events
 */
export const EVM_EVENTS = ['chainChanged', 'accountsChanged'] as const;

/**
 * Supported Sui methods
 */
export const SUI_METHODS = [
  'sui_signTransaction',
  'sui_signAndExecuteTransaction',
  'sui_signMessage',
  'sui_signPersonalMessage',
] as const;

/**
 * Supported Sui events
 */
export const SUI_EVENTS = ['accountsChanged'] as const;

/**
 * Build EIP-155 namespace for EVM chains
 */
export function buildEIP155Namespace(address: string): {
  chains: string[];
  methods: string[];
  events: string[];
  accounts: string[];
} {
  const evmChains = getEVMChains();
  const chains = evmChains.map((c) => `${EIP155_NAMESPACE}:${c.chainId}`);
  const accounts = evmChains.map(
    (c) => `${EIP155_NAMESPACE}:${c.chainId}:${address}`
  );

  return {
    chains,
    methods: [...EVM_METHODS],
    events: [...EVM_EVENTS],
    accounts,
  };
}

/**
 * Build Sui namespace for Move chains
 */
export function buildSuiNamespace(address: string): {
  chains: string[];
  methods: string[];
  events: string[];
  accounts: string[];
} {
  const moveChains = getMoveChains();
  // Use network name as chain reference (e.g., "sui:devnet")
  const chains = moveChains.map((c) => {
    const networkName = c.id.replace('nasun-', '');
    return `${SUI_NAMESPACE}:${networkName}`;
  });
  const accounts = moveChains.map((c) => {
    const networkName = c.id.replace('nasun-', '');
    return `${SUI_NAMESPACE}:${networkName}:${address}`;
  });

  return {
    chains,
    methods: [...SUI_METHODS],
    events: [...SUI_EVENTS],
    accounts,
  };
}

/**
 * Build all supported namespaces for session approval
 *
 * @param evmAddress - EVM address (0x...)
 * @param suiAddress - Sui address (0x...)
 * @returns Namespaces object for WalletConnect
 */
export function buildSessionNamespaces(
  evmAddress?: string,
  suiAddress?: string
): Record<string, { chains: string[]; methods: string[]; events: string[]; accounts: string[] }> {
  const namespaces: Record<
    string,
    { chains: string[]; methods: string[]; events: string[]; accounts: string[] }
  > = {};

  if (evmAddress) {
    namespaces[EIP155_NAMESPACE] = buildEIP155Namespace(evmAddress);
  }

  if (suiAddress) {
    namespaces[SUI_NAMESPACE] = buildSuiNamespace(suiAddress);
  }

  return namespaces;
}

/**
 * Check if we can satisfy the required namespaces from a proposal
 */
export function canSatisfyProposal(
  requiredNamespaces: ProposalTypes.RequiredNamespaces,
  hasEvmSigner: boolean,
  hasSuiSigner: boolean
): { canSatisfy: boolean; missingNamespaces: string[] } {
  const missing: string[] = [];

  for (const [namespace] of Object.entries(requiredNamespaces)) {
    if (namespace === EIP155_NAMESPACE && !hasEvmSigner) {
      missing.push(namespace);
    }
    if (namespace === SUI_NAMESPACE && !hasSuiSigner) {
      missing.push(namespace);
    }
  }

  return {
    canSatisfy: missing.length === 0,
    missingNamespaces: missing,
  };
}

/**
 * Get chain ID from CAIP-2 format
 *
 * @param caip2ChainId - e.g., "eip155:1" or "sui:devnet"
 * @returns Numeric chain ID for EVM, string network name for Sui
 */
export function getChainIdFromCAIP2(caip2ChainId: string): number | string {
  const [namespace, reference] = caip2ChainId.split(':');

  if (namespace === EIP155_NAMESPACE) {
    return parseInt(reference, 10);
  }

  return reference;
}

/**
 * Check if chain ID is EVM
 */
export function isEVMChainId(caip2ChainId: string): boolean {
  return caip2ChainId.startsWith(`${EIP155_NAMESPACE}:`);
}

/**
 * Check if chain ID is Sui
 */
export function isSuiChainId(caip2ChainId: string): boolean {
  return caip2ChainId.startsWith(`${SUI_NAMESPACE}:`);
}

/**
 * Get all supported CAIP-2 chain IDs
 */
export function getAllSupportedChainIds(): string[] {
  const evmChains = getEVMChains().map((c) => `${EIP155_NAMESPACE}:${c.chainId}`);
  const moveChains = getMoveChains().map((c) => {
    const networkName = c.id.replace('nasun-', '');
    return `${SUI_NAMESPACE}:${networkName}`;
  });

  return [...evmChains, ...moveChains];
}
