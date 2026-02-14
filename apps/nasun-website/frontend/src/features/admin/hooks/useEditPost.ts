/**
 * useEditPost - Hook for editing post fields via admin API
 *
 * Admin only - requires Cognito JWT authentication.
 * Invalidates dashboard and leaderboard queries on success.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { editPost } from '../services/leaderboardV3Api';
import { useAdminAuth } from './useAdminAuth';

interface EditPostParams {
  postId: string;
  updates: {
    platform?: string;
    username?: string;
    originalUsername?: string;
    postScore?: number;
    contentSignals?: string[];
    accountRole?: string;
    language?: string;
    followerCount?: number;
  };
}

export function useEditPost() {
  const queryClient = useQueryClient();
  const { cognitoToken } = useAdminAuth();

  return useMutation({
    mutationFn: ({ postId, updates }: EditPostParams) =>
      editPost(cognitoToken || '', postId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['season-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['cumulative-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-v3', 'account'] });
    },
  });
}
