/**
 * useHiddenProposals Hook
 *
 * Manages hidden proposals state using DynamoDB via Admin API.
 * Admin can hide/unhide proposals, which affects public page visibility.
 *
 * Refactored to use React Query for consistent data fetching patterns.
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  getHiddenProposals,
  hideProposal as apiHideProposal,
  unhideProposal as apiUnhideProposal,
} from '../services/adminApi';

const HIDDEN_PROPOSALS_KEY = 'hidden-proposals';

interface UseHiddenProposalsReturn {
  hiddenIds: Set<string>;
  isHidden: (id: string) => boolean;
  hide: (id: string) => Promise<void>;
  unhide: (id: string) => Promise<void>;
  toggle: (id: string) => Promise<void>;
  hiddenCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  isHiding: boolean;
  isUnhiding: boolean;
}

export const useHiddenProposals = (): UseHiddenProposalsReturn => {
  const { user } = useAuth();
  const identityId = user?.identityId;
  const queryClient = useQueryClient();

  // Query for fetching hidden proposals
  const query = useQuery<string[]>({
    queryKey: [HIDDEN_PROPOSALS_KEY, identityId],
    queryFn: () => getHiddenProposals(identityId!),
    enabled: !!identityId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutation for hiding a proposal
  const hideMutation = useMutation({
    mutationFn: (proposalId: string) => apiHideProposal(identityId!, proposalId),
    onSuccess: (_, proposalId) => {
      // Optimistically update cache
      queryClient.setQueryData<string[]>(
        [HIDDEN_PROPOSALS_KEY, identityId],
        (old) => [...(old || []), proposalId]
      );
    },
  });

  // Mutation for unhiding a proposal
  const unhideMutation = useMutation({
    mutationFn: (proposalId: string) => apiUnhideProposal(identityId!, proposalId),
    onSuccess: (_, proposalId) => {
      // Optimistically update cache
      queryClient.setQueryData<string[]>(
        [HIDDEN_PROPOSALS_KEY, identityId],
        (old) => (old || []).filter((id) => id !== proposalId)
      );
    },
  });

  const hiddenIds = useMemo(() => new Set(query.data || []), [query.data]);

  const isHidden = useCallback(
    (id: string) => hiddenIds.has(id),
    [hiddenIds]
  );

  const hide = useCallback(async (id: string) => {
    if (!identityId) {
      throw new Error('Not authenticated');
    }
    await hideMutation.mutateAsync(id);
  }, [identityId, hideMutation]);

  const unhide = useCallback(async (id: string) => {
    if (!identityId) {
      throw new Error('Not authenticated');
    }
    await unhideMutation.mutateAsync(id);
  }, [identityId, unhideMutation]);

  const toggle = useCallback(async (id: string) => {
    if (hiddenIds.has(id)) {
      await unhide(id);
    } else {
      await hide(id);
    }
  }, [hiddenIds, hide, unhide]);

  const refetch = useCallback(async () => {
    await query.refetch();
  }, [query]);

  return {
    hiddenIds,
    isHidden,
    hide,
    unhide,
    toggle,
    hiddenCount: hiddenIds.size,
    isLoading: query.isLoading,
    error: query.error?.message || null,
    refetch,
    isHiding: hideMutation.isPending,
    isUnhiding: unhideMutation.isPending,
  };
};

export default useHiddenProposals;
