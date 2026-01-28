/**
 * Nasun Network Configuration
 * Defines available networks and their settings
 */

import type { NetworkType, NetworkInfo } from '../types';

/**
 * Available Nasun networks
 * Currently only Devnet is enabled, Testnet and Mainnet are coming soon
 */
export const NETWORKS: Record<NetworkType, NetworkInfo> = {
  devnet: {
    type: 'devnet',
    name: 'Nasun Devnet',
    rpcUrl: 'https://rpc.devnet.nasun.io',
    faucetUrl: 'https://faucet.devnet.nasun.io',
    explorerUrl: 'https://explorer.nasun.io/devnet',
    enabled: true,
  },
  testnet: {
    type: 'testnet',
    name: 'Nasun Testnet',
    rpcUrl: '',
    explorerUrl: '',
    enabled: false, // Coming Soon
  },
  mainnet: {
    type: 'mainnet',
    name: 'Nasun Mainnet',
    rpcUrl: '',
    explorerUrl: '',
    enabled: false, // Coming Soon
  },
};

/**
 * Get network info by type
 */
export function getNetworkInfo(type: NetworkType): NetworkInfo {
  return NETWORKS[type];
}

/**
 * Get all enabled networks
 */
export function getEnabledNetworks(): NetworkInfo[] {
  return Object.values(NETWORKS).filter((n) => n.enabled);
}

/**
 * Check if a network has faucet support
 */
export function hasNetworkFaucet(type: NetworkType): boolean {
  const network = NETWORKS[type];
  return network.enabled && !!network.faucetUrl;
}

/**
 * Detect network type from RPC URL
 */
export function detectNetworkType(rpcUrl: string): NetworkType {
  const url = rpcUrl.toLowerCase();

  if (url.includes('mainnet')) {
    return 'mainnet';
  }
  if (url.includes('testnet')) {
    return 'testnet';
  }
  // Default to devnet
  return 'devnet';
}
