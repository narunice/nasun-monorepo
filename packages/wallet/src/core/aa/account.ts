/**
 * Smart Account Factory
 *
 * Creates and manages ERC-4337 smart accounts.
 * Uses permissionless's toSimpleSmartAccount as the default implementation.
 */

import { type Address, type Chain, createPublicClient, http } from 'viem';
import {
  toSimpleSmartAccount,
  type ToSimpleSmartAccountReturnType,
} from 'permissionless/accounts';
import { entryPoint07Address } from 'viem/account-abstraction';
import type { EVMSigner } from '../signer/adapters/EVMSigner';
import type { ChainConfig } from '../../config/chains';
import type { SmartAccountState, SmartAccountOptions } from './types';

/** Type alias for SimpleSmartAccount */
export type SimpleSmartAccount = ToSimpleSmartAccountReturnType<'0.7'>;

/** Smart account cache: chainId -> account */
const accountCache: Map<number, SimpleSmartAccount> = new Map();

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
 * Create or get SimpleSmartAccount from EOA signer
 *
 * SimpleSmartAccount is the default ERC-4337 implementation.
 * Uses the EOA as the single owner with ECDSA validation.
 *
 * @param signer - EVMSigner providing the owner account
 * @param chain - Chain configuration with AA support
 * @param options - Optional account configuration
 * @returns SimpleSmartAccount instance
 */
export async function getSimpleSmartAccount(
  signer: EVMSigner,
  chain: ChainConfig,
  _options?: SmartAccountOptions
): Promise<SimpleSmartAccount> {
  if (!chain.aa) {
    throw new Error(`Chain ${chain.id} does not support Account Abstraction`);
  }

  const chainId = chain.chainId!;

  // Return cached account if exists
  if (accountCache.has(chainId)) {
    return accountCache.get(chainId)!;
  }

  const viemChain = buildViemChain(chain);

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(chain.rpcUrl),
  });

  // Create smart account with EOA as owner
  const account = await toSimpleSmartAccount({
    client: publicClient,
    owner: signer.getAccount(),
    entryPoint: {
      address: chain.aa.entryPoint || entryPoint07Address,
      version: '0.7',
    },
  });

  // Cache the account
  accountCache.set(chainId, account);

  return account;
}

/**
 * Get smart account address (counterfactual)
 *
 * Returns the deterministic address even before deployment.
 * The address is derived from the owner address and salt.
 *
 * @param signer - EVMSigner providing the owner account
 * @param chain - Chain configuration with AA support
 * @param salt - Optional salt for address derivation
 * @returns Smart account address
 */
export async function getSmartAccountAddress(
  signer: EVMSigner,
  chain: ChainConfig,
  _salt?: bigint
): Promise<Address> {
  const account = await getSimpleSmartAccount(signer, chain);
  return account.address;
}

/**
 * Check if smart account is deployed on-chain
 *
 * @param chain - Chain configuration
 * @param address - Smart account address to check
 * @returns true if account has code deployed
 */
export async function isAccountDeployed(
  chain: ChainConfig,
  address: Address
): Promise<boolean> {
  const viemChain = buildViemChain(chain);

  const publicClient = createPublicClient({
    chain: viemChain,
    transport: http(chain.rpcUrl),
  });

  const code = await publicClient.getBytecode({ address });
  return code !== undefined && code !== '0x';
}

/**
 * Get smart account state
 *
 * @param signer - EVMSigner providing the owner account
 * @param chain - Chain configuration with AA support
 * @returns Smart account state
 */
export async function getSmartAccountState(
  signer: EVMSigner,
  chain: ChainConfig
): Promise<SmartAccountState> {
  const account = await getSimpleSmartAccount(signer, chain);
  const deployed = await isAccountDeployed(chain, account.address);

  return {
    address: account.address,
    isDeployed: deployed,
    type: 'simple',
    owner: signer.address as Address,
    chainId: chain.chainId!,
  };
}

/**
 * Clear smart account cache
 */
export function clearAccountCache(): void {
  accountCache.clear();
}

/**
 * Get cached smart account for a chain
 *
 * @param chainId - EVM chain ID
 * @returns Cached account or undefined
 */
export function getCachedAccount(chainId: number): SimpleSmartAccount | undefined {
  return accountCache.get(chainId);
}
