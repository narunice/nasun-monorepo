import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateNftCollectionRequest, UpdateNftCollectionRequest } from '../types';
import {
  getAdminNftCollections,
  getEnabledNftCollections,
  createNftCollection,
  updateNftCollection,
  deleteNftCollection,
} from '../services/nftCollectionApi';

const ADMIN_KEY = ['admin', 'nft-collections'] as const;
const PUBLIC_KEY = ['nft-collections', 'enabled'] as const;

/**
 * Admin hook — fetches all collections (including disabled)
 */
export function useAdminNftCollections(cognitoToken: string | undefined | null) {
  return useQuery({
    queryKey: [...ADMIN_KEY],
    queryFn: () => getAdminNftCollections(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 60_000,
  });
}

/**
 * Public hook — fetches only enabled collections (for MY ASSETS filtering)
 */
export function useEnabledNftCollections() {
  return useQuery({
    queryKey: [...PUBLIC_KEY],
    queryFn: getEnabledNftCollections,
    staleTime: 5 * 60_000, // 5 minutes
  });
}

/**
 * Create a new NFT collection
 */
export function useCreateNftCollection(cognitoToken: string | undefined | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateNftCollectionRequest) =>
      createNftCollection(cognitoToken!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY] });
      queryClient.invalidateQueries({ queryKey: [...PUBLIC_KEY] });
      queryClient.invalidateQueries({ queryKey: ['multi-chain-nfts'] });
    },
  });
}

/**
 * Update an NFT collection (name, enabled toggle, etc.)
 */
export function useUpdateNftCollection(cognitoToken: string | undefined | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { collectionId: string; updates: UpdateNftCollectionRequest }) =>
      updateNftCollection(cognitoToken!, params.collectionId, params.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY] });
      queryClient.invalidateQueries({ queryKey: [...PUBLIC_KEY] });
      queryClient.invalidateQueries({ queryKey: ['multi-chain-nfts'] });
    },
  });
}

/**
 * Delete an NFT collection
 */
export function useDeleteNftCollection(cognitoToken: string | undefined | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (collectionId: string) =>
      deleteNftCollection(cognitoToken!, collectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ADMIN_KEY] });
      queryClient.invalidateQueries({ queryKey: [...PUBLIC_KEY] });
      queryClient.invalidateQueries({ queryKey: ['multi-chain-nfts'] });
    },
  });
}
