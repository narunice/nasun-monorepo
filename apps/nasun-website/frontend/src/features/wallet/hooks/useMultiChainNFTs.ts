/**
 * useMultiChainNFTs Hook
 *
 * React Query hook for fetching NFTs across Ethereum and Polygon networks.
 * Uses Alchemy API for both chains with Etherscan fallback for Ethereum.
 *
 * @module hooks/wallet/useMultiChainNFTs
 */

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getAllChainNFTs } from '../../../services/ethereumApi';
import type { EthereumNFT } from '../../../types/ethereum';

export const useMultiChainNFTs = (
  walletAddress: string | undefined
): UseQueryResult<EthereumNFT[], Error> => {
  return useQuery({
    queryKey: ['multi-chain-nfts', walletAddress?.toLowerCase()],

    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet address is required');
      }
      return await getAllChainNFTs(walletAddress);
    },

    enabled: !!walletAddress,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};
