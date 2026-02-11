/**
 * useEditPost - Hook for editing post fields via admin API
 *
 * Admin only - requires authentication.
 * Invalidates dashboard and leaderboard queries on success.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { editPost } from '../services/leaderboardV3Api';

const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD;

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

  return useMutation({
    mutationFn: ({ postId, updates }: EditPostParams) =>
      editPost(ADMIN_PASSWORD, postId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['season-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['cumulative-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-v3', 'account'] });
    },
  });
}
