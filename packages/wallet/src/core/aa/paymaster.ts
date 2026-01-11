/**
 * ERC-4337 Paymaster Client
 *
 * Manages paymaster integration for sponsored transactions.
 * Uses Pimlico as the default paymaster provider via permissionless.
 */

import { http, type Chain } from 'viem';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import type { ChainConfig } from '../../config/chains';
import { entryPoint07Address } from 'viem/account-abstraction';

/** Pimlico client type */
type PimlicoClientType = ReturnType<typeof createPimlicoClient>;

/** Paymaster client cache by chainId */
const paymasterClients: Map<number, PimlicoClientType> = new Map();

/**
 * Build viem Chain object from ChainConfig
 */
function buildViemChain(config: ChainConfig): Chain {
  return {
    id: config.chainId!,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
    blockExplorers: config.blockExplorer
      ? {
          default: { name: config.name, url: config.blockExplorer },
        }
      : undefined,
  } as Chain;
}

/**
 * Get or create Pimlico paymaster client
 *
 * Pimlico provides verifying paymaster for sponsored transactions.
 * Requires an API key from Pimlico dashboard.
 *
 * @param chain - Chain configuration with AA support
 * @param apiKey - Pimlico API key
 * @returns Pimlico client instance
 * @throws Error if chain doesn't support AA
 */
export function getPaymasterClient(
  chain: ChainConfig,
  apiKey: string
): PimlicoClientType {
  if (!chain.aa) {
    throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
  }

  const chainId = chain.chainId!;

  // Return cached client if exists
  if (paymasterClients.has(chainId)) {
    return paymasterClients.get(chainId)!;
  }

  // Use bundler URL as paymaster URL (Pimlico uses same endpoint)
  const paymasterUrl = chain.aa.paymasterUrl || chain.aa.bundlerUrl;
  const fullUrl = `${paymasterUrl}?apikey=${apiKey}`;

  const viemChain = buildViemChain(chain);

  // Create Pimlico client
  const client = createPimlicoClient({
    chain: viemChain,
    transport: http(fullUrl),
    entryPoint: {
      address: chain.aa.entryPoint || entryPoint07Address,
      version: '0.7',
    },
  });

  paymasterClients.set(chainId, client);
  return client;
}

/**
 * Clear paymaster client cache
 */
export function clearPaymasterClients(): void {
  paymasterClients.clear();
}

/**
 * Check if paymaster is available for a chain
 *
 * @param chain - Chain configuration
 * @returns true if paymaster URL is configured
 */
export function hasPaymaster(chain: ChainConfig): boolean {
  return !!(chain.aa?.paymasterUrl || chain.aa?.bundlerUrl);
}
