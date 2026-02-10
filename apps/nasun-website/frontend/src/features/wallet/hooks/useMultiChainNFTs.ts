/**
 * useMultiChainNFTs Hook
 *
 * React Query hook for fetching NFTs across Ethereum and Polygon networks.
 * Uses Alchemy API for both chains with Etherscan fallback for Ethereum.
 * When NFT collections are configured in admin, filters to only those collections.
 *
 * @module hooks/wallet/useMultiChainNFTs
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAllChainNFTs, type ChainContractFilter } from '../../../services/ethereumApi';
import { useEnabledNftCollections } from '../../admin/hooks/useNftCollections';
import type { EthereumNFT } from '../../../types/ethereum';

/**
 * Build chain-specific contract address filter from enabled collections.
 * Returns undefined if no collections are configured (= show all NFTs).
 */
function buildContractFilter(
  collections: { contractAddress: string; chain: string }[] | undefined
): ChainContractFilter | undefined {
  if (!collections || collections.length === 0) return undefined;

  const ethAddresses = collections
    .filter((c) => c.chain === 'ethereum')
    .map((c) => c.contractAddress);

  const polyAddresses = collections
    .filter((c) => c.chain === 'polygon')
    .map((c) => c.contractAddress);

  // Only include chains that have at least one registered collection
  const filter: ChainContractFilter = {};
  if (ethAddresses.length > 0) filter.ethereum = ethAddresses;
  if (polyAddresses.length > 0) filter.polygon = polyAddresses;

  return Object.keys(filter).length > 0 ? filter : undefined;
}

export const useMultiChainNFTs = (
  walletAddress: string | undefined
): UseQueryResult<EthereumNFT[], Error> => {
  const { data: collections, isLoading: isCollectionsLoading } = useEnabledNftCollections();
  const contractFilter = buildContractFilter(collections);

  return useQuery({
    queryKey: ['multi-chain-nfts', walletAddress?.toLowerCase(), contractFilter],

    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      return await getAllChainNFTs(walletAddress, contractFilter);
    },

    // Wait for both wallet address and collections config before fetching
    enabled: !!walletAddress && !isCollectionsLoading,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};
