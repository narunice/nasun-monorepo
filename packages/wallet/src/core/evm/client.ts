/**
 * EVM Client Utilities
 *
 * Creates and manages viem PublicClient instances for EVM chains.
 */

import {
  createPublicClient,
  http,
  type PublicClient,
  type Chain,
} from 'viem';
import {
  mainnet,
  base,
  arbitrum,
  baseSepolia,
  arbitrumSepolia,
} from 'viem/chains';
import type { ChainConfig } from '../../config/chains';

/** Cache of PublicClient instances by chain ID */
const clientCache = new Map<string, PublicClient>();

/**
 * Mapping of chain config IDs to viem Chain objects
 */
const VIEM_CHAINS: Record<string, Chain> = {
  ethereum: mainnet,
  base: base,
  arbitrum: arbitrum,
  'base-sepolia': baseSepolia,
  'arbitrum-sepolia': arbitrumSepolia,
};

/**
 * Get viem Chain object for a chain config
 */
export function getViemChain(chainConfig: ChainConfig): Chain {
  const viemChain = VIEM_CHAINS[chainConfig.id];
  if (viemChain) return viemChain;

  // Fallback: create custom chain definition
  if (!chainConfig.chainId) {
    throw new Error(`Chain ${chainConfig.id} is not an EVM chain`);
  }

  return {
    id: chainConfig.chainId,
    name: chainConfig.name,
    nativeCurrency: chainConfig.nativeCurrency,
    rpcUrls: {
      default: { http: [chainConfig.rpcUrl] },
    },
    blockExplorers: chainConfig.blockExplorer
      ? {
          default: {
            name: 'Explorer',
            url: chainConfig.blockExplorer,
          },
        }
      : undefined,
  } as Chain;
}

/**
 * Get or create a PublicClient for an EVM chain
 *
 * @param chainConfig - Chain configuration
 * @returns viem PublicClient instance
 */
export function getEVMClient(chainConfig: ChainConfig): PublicClient {
  if (chainConfig.type !== 'evm') {
    throw new Error(`Chain ${chainConfig.id} is not an EVM chain`);
  }

  const cached = clientCache.get(chainConfig.id);
  if (cached) return cached;

  const chain = getViemChain(chainConfig);

  const client = createPublicClient({
    chain,
    transport: http(chainConfig.rpcUrl),
    batch: {
      multicall: true,
    },
  });

  clientCache.set(chainConfig.id, client);
  return client;
}

/**
 * Clear the client cache (useful for testing or chain switching)
 */
export function clearClientCache(): void {
  clientCache.clear();
}

/**
 * Get client for a specific chain ID
 */
export function getEVMClientById(chainId: string): PublicClient | null {
  return clientCache.get(chainId) ?? null;
}
