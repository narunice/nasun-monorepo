import { useInfiniteQuery, useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  submitCreatorPost,
  listMyCreatorPosts,
  listAdminCreatorPosts,
  scoreCreatorPost,
  rejectCreatorPost,
  grantCreatorPost,
} from './api';
import type { CreatorPostStatus } from './types';

// ============================================
// User hooks
// ============================================

export function useSubmitCreatorPost(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postUrl: string) => {
      if (!token) throw new Error('Not authenticated');
      return submitCreatorPost(postUrl, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-posts', 'my'] });
    },
  });
}

export function useMyCreatorPosts(token: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: ['creator-posts', 'my'],
    queryFn: ({ pageParam }) => listMyCreatorPosts(token!, { limit: 10, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!token,
    staleTime: 30_000,
  });
}

// ============================================
// Admin hooks
// ============================================

export function useAdminCreatorPosts(
  token: string | null | undefined,
  params: { status?: CreatorPostStatus; cursor?: string },
) {
  return useQuery({
    queryKey: ['creator-posts', 'admin', params.status || 'PENDING', params.cursor || null],
    queryFn: () => listAdminCreatorPosts(token!, params),
    enabled: !!token,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useScoreCreatorPost(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, points }: { postId: string; points: number }) => {
      if (!token) throw new Error('Not authenticated');
      return scoreCreatorPost(postId, points, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-posts', 'admin'] });
    },
  });
}

export function useRejectCreatorPost(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, reason }: { postId: string; reason: string }) => {
      if (!token) throw new Error('Not authenticated');
      return rejectCreatorPost(postId, reason, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-posts', 'admin'] });
    },
  });
}

export function useGrantCreatorPost(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => {
      if (!token) throw new Error('Not authenticated');
      return grantCreatorPost(postId, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-posts', 'admin'] });
    },
  });
}
