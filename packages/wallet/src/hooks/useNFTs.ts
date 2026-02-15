/**
 * useNFTs Hook
 * Query NFTs owned by the connected wallet (supports both regular wallet and zkLogin)
 */

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { usePasskeyStore } from '../stores/passkeyStore';
import { getOwnedNFTs } from '../sui/nft';
import type { NFTInfo, NFTQueryOptions, NFTSortBy } from '../types/nft';
import { DEFAULT_NFT_SORT } from '../types/nft';

// Query key prefix for NFT queries
const NFT_QUERY_KEY = 'nasun-wallet-nfts';

export interface UseNFTsOptions extends NFTQueryOptions {
  /** Disable automatic fetching */
  enabled?: boolean;
  /** Refetch interval in milliseconds */
  refetchInterval?: number;
  /** Sort order */
  sortBy?: NFTSortBy;
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
 * Sort NFTs based on the given sort option
 */
function sortNFTs(nfts: NFTInfo[], sortBy: NFTSortBy): NFTInfo[] {
  const sorted = [...nfts];

  switch (sortBy) {
    case 'newest':
      // Sort by version descending (higher version = more recent)
      return sorted.sort((a, b) => {
        const versionA = BigInt(a.version);
        const versionB = BigInt(b.version);
        return versionB > versionA ? 1 : versionB < versionA ? -1 : 0;
      });

    case 'oldest':
      // Sort by version ascending
      return sorted.sort((a, b) => {
        const versionA = BigInt(a.version);
        const versionB = BigInt(b.version);
        return versionA > versionB ? 1 : versionA < versionB ? -1 : 0;
      });

    case 'name_asc':
      // Sort by name A-Z
      return sorted.sort((a, b) => {
        const nameA = a.display.name?.toLowerCase() || '';
        const nameB = b.display.name?.toLowerCase() || '';
        return nameA.localeCompare(nameB);
      });

    case 'name_desc':
      // Sort by name Z-A
      return sorted.sort((a, b) => {
        const nameA = a.display.name?.toLowerCase() || '';
        const nameB = b.display.name?.toLowerCase() || '';
        return nameB.localeCompare(nameA);
      });

    default:
      return sorted;
  }
}

/**
 * Hook to query NFTs owned by the connected wallet
 * Supports both regular wallet and zkLogin
 */
export function useNFTs(options: UseNFTsOptions = {}): UseNFTsResult {
  const { account, status } = useWallet();
  const { state: zkLoginState, isConnected: isZkConnected } = useZkLogin();
  const { enabled = true, refetchInterval, limit, cursor, sortBy = DEFAULT_NFT_SORT } = options;

  // Use wallet address, zkLogin address, or passkey address
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const ownerAddress = account?.address || zkLoginState?.address || passkeyAddress;
  const isConnected = (status === 'unlocked' && account?.address) || isZkConnected || isPasskeyUnlocked;

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

  // Sort NFTs client-side (Sui API doesn't support sorting)
  const sortedData = useMemo(() => {
    const rawData = query.data?.data || [];
    return sortNFTs(rawData, sortBy);
  }, [query.data?.data, sortBy]);

  return {
    data: sortedData,
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
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const queryClient = useQueryClient();

  const ownerAddress = account?.address || zkLoginState?.address || passkeyAddress;

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
