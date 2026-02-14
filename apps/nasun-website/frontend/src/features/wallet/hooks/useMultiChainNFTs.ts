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
 *
 * - `undefined` collections (not yet loaded / error) → return `undefined` so
 *   the caller can disable the query until data arrives.
 * - Empty array (API responded with no active collections) → return `{}`
 *   (empty filter) so the caller knows "show nothing".
 */
function buildContractFilter(
  collections: { contractAddress: string; chain: string }[] | undefined
): ChainContractFilter | undefined {
  // Not yet loaded — caller should disable the query
  if (collections === undefined) return undefined;

  // Loaded but empty — explicitly means "no external chain NFTs"
  if (collections.length === 0) return {};

  const ethAddresses = collections
    .filter((c) => c.chain === 'ethereum')
    .map((c) => c.contractAddress);

  const polyAddresses = collections
    .filter((c) => c.chain === 'polygon')
    .map((c) => c.contractAddress);

  const filter: ChainContractFilter = {};
  if (ethAddresses.length > 0) filter.ethereum = ethAddresses;
  if (polyAddresses.length > 0) filter.polygon = polyAddresses;

  return Object.keys(filter).length > 0 ? filter : {};
}

export const useMultiChainNFTs = (
  walletAddress: string | undefined
): UseQueryResult<EthereumNFT[], Error> => {
  const { data: collections } = useEnabledNftCollections();
  const contractFilter = buildContractFilter(collections);

  return useQuery({
    queryKey: ['multi-chain-nfts', walletAddress?.toLowerCase(), contractFilter],

    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      // Empty filter = admin configured no active collections → show nothing
      if (contractFilter && Object.keys(contractFilter).length === 0) {
        return [];
      }
      return await getAllChainNFTs(walletAddress, contractFilter);
    },

    // Wait for wallet address AND collections to be resolved (not undefined)
    enabled: !!walletAddress && contractFilter !== undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
  });
};
