/**
 * useNFTs Hook
 * Query NFTs owned by the connected wallet
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from './useWallet';
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
 */
export function useNFTs(options: UseNFTsOptions = {}): UseNFTsResult {
  const { account, status } = useWallet();
  const { enabled = true, refetchInterval, limit, cursor } = options;

  const isConnected = status === 'unlocked' && account?.address;

  const query = useQuery({
    queryKey: [NFT_QUERY_KEY, account?.address, limit, cursor],
    queryFn: async () => {
      if (!account?.address) {
        throw new Error('Wallet not connected');
      }
      return getOwnedNFTs(account.address, { limit, cursor });
    },
    enabled: enabled && !!isConnected,
    refetchInterval,
    staleTime: 30000, // 30 seconds
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
 */
export function useRefreshNFTs() {
  const { account } = useWallet();
  const queryClient = useQueryClient();

  return () => {
    if (account?.address) {
      queryClient.invalidateQueries({
        queryKey: [NFT_QUERY_KEY, account.address],
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
