/**
 * ERC-4337 Bundler Client
 *
 * Creates and manages bundler clients for submitting UserOperations.
 * Uses viem's account-abstraction module with Pimlico as the default provider.
 */

import { http, type Chain } from 'viem';
import {
  createBundlerClient,
  type BundlerClient,
  entryPoint07Address,
} from 'viem/account-abstraction';
import type { ChainConfig } from '../../config/chains';

/** Bundler client cache by chainId */
const bundlerClients: Map<number, BundlerClient> = new Map();

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
 * Get or create bundler client for a chain
 *
 * @param chain - Chain configuration with AA support
 * @param apiKey - Optional API key for bundler (e.g., Pimlico)
 * @returns Bundler client instance
 * @throws Error if chain doesn't support AA
 */
export function getBundlerClient(
  chain: ChainConfig,
  apiKey?: string
): BundlerClient {
  if (!chain.aa) {
    throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
  }

  const chainId = chain.chainId!;

  // Return cached client if exists
  if (bundlerClients.has(chainId)) {
    return bundlerClients.get(chainId)!;
  }

  const viemChain = buildViemChain(chain);

  // Build bundler URL with API key if provided
  let bundlerUrl = chain.aa.bundlerUrl;
  if (apiKey) {
    bundlerUrl = `${bundlerUrl}?apikey=${apiKey}`;
  }

  // Create bundler client
  const client = createBundlerClient({
    chain: viemChain,
    transport: http(bundlerUrl),
  });

  bundlerClients.set(chainId, client);
  return client;
}

/**
 * Get the EntryPoint address for a chain
 *
 * @param chain - Chain configuration
 * @returns EntryPoint address
 */
export function getEntryPoint(chain: ChainConfig): `0x${string}` {
  if (!chain.aa) {
    throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
  }
  return chain.aa.entryPoint;
}

/**
 * Get the default EntryPoint v0.7 address
 */
export function getDefaultEntryPoint(): `0x${string}` {
  return entryPoint07Address;
}

/**
 * Clear bundler client cache
 */
export function clearBundlerClients(): void {
  bundlerClients.clear();
}

/**
 * Check if a bundler is reachable
 *
 * @param chain - Chain configuration
 * @returns true if bundler responds
 */
export async function isBundlerReachable(chain: ChainConfig): Promise<boolean> {
  try {
    const client = getBundlerClient(chain);
    // Try to get supported entry points
    await client.getSupportedEntryPoints();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current gas prices from bundler
 *
 * Uses eth_gasPrice and eth_maxPriorityFeePerGas for EIP-1559 chains.
 *
 * @param chain - Chain configuration
 * @param apiKey - Optional API key
 * @returns Gas price information
 */
export async function getGasPrices(
  chain: ChainConfig,
  apiKey?: string
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const client = getBundlerClient(chain, apiKey);

  // Use getUserOperationGasPrice from Pimlico bundler
  // This returns recommended gas prices for UserOperations
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gasPrice = await (client as any).request({
      method: 'pimlico_getUserOperationGasPrice',
    });

    if (gasPrice?.standard) {
      return {
        maxFeePerGas: BigInt(gasPrice.standard.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(gasPrice.standard.maxPriorityFeePerGas),
      };
    }
  } catch {
    // Fall through to default
  }

  // Default gas prices if bundler doesn't support pimlico method
  return {
    maxFeePerGas: 10n * 10n ** 9n, // 10 gwei
    maxPriorityFeePerGas: 1n * 10n ** 9n, // 1 gwei
  };
}

/**
 * Format gas estimate to human-readable values
 *
 * @param estimate - Raw gas estimate with gas limits and prices
 * @returns Formatted estimate with ETH cost
 */
export function formatGasEstimate(estimate: {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
}): {
  totalGas: bigint;
  costInWei: bigint;
  costInEth: string;
} {
  const totalGas =
    estimate.callGasLimit +
    estimate.verificationGasLimit +
    estimate.preVerificationGas;

  const costInWei = totalGas * estimate.maxFeePerGas;

  // Convert to ETH string (18 decimals)
  const ethValue = Number(costInWei) / 1e18;
  const costInEth = ethValue.toFixed(6);

  return {
    totalGas,
    costInWei,
    costInEth,
  };
}
