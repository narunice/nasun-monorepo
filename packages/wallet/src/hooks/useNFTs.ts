/**
 * useNFTs Hook
 * Query NFTs owned by the connected wallet (supports both regular wallet and zkLogin)
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { getOwnedNFTs } from '../sui/nft';
import type { NFTInfo, NFTQueryOptions } from '../types/nft';

// Query key prefix for NFT queries
const NFT_QUERY_KEY = 'nasun-wallet-nfts';

export interface UseNFTsOptions extends NFTQueryOptions {
  /** Disable automatic fetching */
  enabled?: boolean;
  /** Refetch interval in milliseconds */
  refetchInterval?: number;
}

export interface UseNFTsResult {
  /** List of NFTs */
  data: NFTInfo[];
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether there are more NFTs to load */
  hasNextPage: boolean;
  /** Cursor for next page */
  nextCursor?: string;
  /** Refetch function */
  refetch: () => void;
}

/**
 * Hook to query NFTs owned by the connected wallet
 * Supports both regular wallet and zkLogin
 */
export function useNFTs(options: UseNFTsOptions = {}): UseNFTsResult {
  const { account, status } = useWallet();
  const { state: zkLoginState, isConnected: isZkConnected } = useZkLogin();
  const { enabled = true, refetchInterval, limit, cursor } = options;

  // Use wallet address or zkLogin address
  const ownerAddress = account?.address || zkLoginState?.address;
  const isConnected = (status === 'unlocked' && account?.address) || isZkConnected;

  const query = useQuery({
    queryKey: [NFT_QUERY_KEY, ownerAddress, limit, cursor],
    queryFn: async () => {
      if (!ownerAddress) {
        throw new Error('Wallet not connected');
      }
      return getOwnedNFTs(ownerAddress, { limit, cursor });
    },
    enabled: enabled && !!isConnected && !!ownerAddress,
    refetchInterval,
    refetchIntervalInBackground: true, // Continue refetching even when tab is not focused
    refetchOnWindowFocus: true, // Refetch when user returns to the tab
    staleTime: 10000, // 10 seconds (reduced from 30s for faster updates)
  });

  return {
    data: query.data?.data || [],
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    hasNextPage: query.data?.hasNextPage || false,
    nextCursor: query.data?.nextCursor,
    refetch: query.refetch,
  };
}

/**
 * Hook to refresh NFT list
 * Supports both regular wallet and zkLogin
 */
export function useRefreshNFTs() {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const queryClient = useQueryClient();

  const ownerAddress = account?.address || zkLoginState?.address;

  return () => {
    if (ownerAddress) {
      queryClient.invalidateQueries({
        queryKey: [NFT_QUERY_KEY, ownerAddress],
      });
    }
  };
}

/**
 * Hook to invalidate NFT cache (for external use)
 */
export function useInvalidateNFTs() {
  const queryClient = useQueryClient();

  return (address?: string) => {
    if (address) {
      queryClient.invalidateQueries({
        queryKey: [NFT_QUERY_KEY, address],
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: [NFT_QUERY_KEY],
      });
    }
  };
}
