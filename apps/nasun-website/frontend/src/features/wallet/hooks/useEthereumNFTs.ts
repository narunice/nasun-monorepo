/**
 * useEthereumNFTs Hook
 *
 * React Query hook for fetching Ethereum NFT data.
 *
 * Features:
 * - Automatic caching (5 minutes stale time)
 * - Loading and error states
 * - Only queries when walletAddress is provided
 * - Consistent pattern with existing Sui/IOTA hooks
 *
 * @module hooks/wallet/useEthereumNFTs
 * @since 2025-11-13
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getEthereumNFTs } from '../../../services/ethereumApi';
import type { EthereumNFT } from '../../../types/ethereum';

/**
 * Hook Options
 */
interface UseEthereumNFTsOptions {
  /** Enable/disable the query */
  enabled?: boolean;

  /** Stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;

  /** Cache time in milliseconds (default: 30 minutes) */
  cacheTime?: number;

  /** Number of retries on failure (default: 1) */
  retry?: number;
}

/**
 * useEthereumNFTs Hook
 *
 * Fetches Ethereum NFTs owned by a wallet address using React Query.
 *
 * @param walletAddress - Ethereum wallet address (0x...)
 * @param options - Hook options (optional)
 * @returns UseQueryResult with NFT data, loading, and error states
 *
 * @example
 * ```typescript
 * const { data: nfts, isLoading, error } = useEthereumNFTs(walletAddress);
 *
 * if (isLoading) return <div>Loading NFTs...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 *
 * return (
 *   <div>
 *     {nfts?.map(nft => (
 *       <NFTCard key={`${nft.contractAddress}-${nft.tokenId}`} nft={nft} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export const useEthereumNFTs = (
  walletAddress: string | undefined,
  options?: UseEthereumNFTsOptions
): UseQueryResult<EthereumNFT[], Error> => {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 30 * 60 * 1000, // 30 minutes
    retry = 1,
  } = options || {};

  return useQuery({
    // Query key includes wallet address for proper caching
    queryKey: ['ethereum-nfts', walletAddress?.toLowerCase()],

    // Query function
    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      return await getEthereumNFTs(walletAddress);
    },

    // Only query when wallet address is provided and enabled
    enabled: enabled && !!walletAddress,

    // 5-minute stale time to minimize API calls
    // React Query will serve cached data within this time
    staleTime,

    // 30-minute cache time
    // Cached data will be garbage collected after this time
    gcTime: cacheTime,

    // Retry once if Alchemy fails (it will fallback to Etherscan internally)
    retry,

    // Don't refetch on window focus (NFTs don't change frequently)
    refetchOnWindowFocus: false,

    // Don't refetch on mount if we have fresh data
    refetchOnMount: false,

    // Don't refetch on reconnect
    refetchOnReconnect: false,
  });
};

/**
 * Hook return type for external use
 */
export type UseEthereumNFTsReturn = ReturnType<typeof useEthereumNFTs>;
