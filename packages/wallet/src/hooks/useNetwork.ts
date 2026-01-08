/**
 * useNetwork Hook
 * Provides current network information for the wallet
 */

import { useMemo } from 'react';
import { getWalletConfig } from '../sui/client';
import {
  NETWORKS,
  detectNetworkType,
  getNetworkInfo,
  hasNetworkFaucet,
} from '../config/networks';
import type { NetworkType, NetworkInfo } from '../types';

export interface UseNetworkResult {
  /** Current network type */
  networkType: NetworkType;
  /** Current network info */
  networkInfo: NetworkInfo;
  /** Whether current network is devnet */
  isDevnet: boolean;
  /** Whether current network is testnet */
  isTestnet: boolean;
  /** Whether current network is mainnet */
  isMainnet: boolean;
  /** Whether faucet is available on current network */
  hasFaucet: boolean;
  /** All available networks */
  networks: typeof NETWORKS;
}

/**
 * Hook to get current network information
 * Detects network type from configured RPC URL or explicit networkType setting
 */
export function useNetwork(): UseNetworkResult {
  const config = getWalletConfig();

  return useMemo(() => {
    // Use explicit networkType if set, otherwise detect from RPC URL
    const networkType = config.networkType ?? detectNetworkType(config.rpcUrl);
    const networkInfo = getNetworkInfo(networkType);

    return {
      networkType,
      networkInfo,
      isDevnet: networkType === 'devnet',
      isTestnet: networkType === 'testnet',
      isMainnet: networkType === 'mainnet',
      hasFaucet: hasNetworkFaucet(networkType),
      networks: NETWORKS,
    };
  }, [config.networkType, config.rpcUrl]);
}
