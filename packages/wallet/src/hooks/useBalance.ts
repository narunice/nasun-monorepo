/**
 * Nasun Wallet Balance Hook
 * TanStack Query based server state management
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBalance } from '../sui/client';
import type { BalanceInfo } from '../types';
import { getChain, getAddressScheme, isNasunChain } from '../config/chains';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { useChainStore } from './useChain';
import { useSignerAddress } from './useSigner';
import { SignerManager } from '../core/signer/SignerManager';

// Query key
const BALANCE_QUERY_KEY = 'wallet-balance';

// Polling interval (30 seconds)
const POLLING_INTERVAL = 30_000;

/**
 * Balance query hook
 * @param address Address to query (defaults to connected wallet address)
 * @param options Options { enabled, pollingInterval }
 */
export function useBalance(
  address?: string,
  options?: {
    enabled?: boolean;
    pollingInterval?: number;
  }
) {
  const { account, status } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const chainId = useChainStore((s) => s.currentChainId);
  const signerAddress = useSignerAddress();

  // Prefer signer address (chain-aware) over wallet store address (always Sui-derived)
  const targetAddress = address ?? signerAddress ?? account?.address ?? zkState?.address;

  // Debug: trace address source only when values change (not every render)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && targetAddress) {
      const source = address ? 'explicit' : signerAddress ? 'signer' : account?.address ? 'account' : 'zkLogin';
      console.log(`[useBalance] chain=${chainId} source=${source} address=${targetAddress.slice(0, 10)}...`);
    }
  }, [chainId, targetAddress]);

  // Enable query when mnemonic wallet unlocked OR zkLogin connected
  const isWalletConnected = status === 'unlocked' || isZkConnected;

  // Prevent stale balance query during chain switch: if chain uses non-Sui scheme
  // but signerAddress hasn't updated yet (still Sui-derived), skip the query.
  const scheme = getAddressScheme(chainId);
  const isSignerStale = status === 'unlocked' && scheme !== 'sui'
    && (!signerAddress || signerAddress === account?.address);

  const isEnabled = options?.enabled !== false && !!targetAddress && isWalletConnected && !isSignerStale;

  return useQuery<BalanceInfo>({
    queryKey: [BALANCE_QUERY_KEY, chainId, targetAddress],
    queryFn: async () => {
      if (!targetAddress) {
        throw new Error('No address provided');
      }
      // Use chain-specific RPC for external Move chains (Sui, IOTA)
      const chain = getChain(chainId);
      const rpcUrl = chain && !isNasunChain(chainId) ? chain.rpcUrl : undefined;
      return getBalance(targetAddress, rpcUrl, chainId);
    },
    enabled: isEnabled,
    refetchInterval: options?.pollingInterval ?? POLLING_INTERVAL,
    staleTime: 10_000, // Use cache for 10 seconds
  });
}

/**
 * Balance refresh function
 * Use to manually refresh balance after transactions
 */
export function useRefreshBalance() {
  const queryClient = useQueryClient();
  const { account } = useWallet();
  const { state: zkState } = useZkLogin();
  const chainId = useChainStore((s) => s.currentChainId);

  return async () => {
    const signerAddr = SignerManager.getCurrent()?.address;
    const address = signerAddr ?? account?.address ?? zkState?.address;
    if (address) {
      await queryClient.invalidateQueries({
        queryKey: [BALANCE_QUERY_KEY, chainId, address],
      });
    }
  };
}

/**
 * Invalidate balance cache for specific address
 */
export function useInvalidateBalance() {
  const queryClient = useQueryClient();
  const chainId = useChainStore((s) => s.currentChainId);

  return (address: string) => {
    queryClient.invalidateQueries({
      queryKey: [BALANCE_QUERY_KEY, chainId, address],
    });
  };
}
