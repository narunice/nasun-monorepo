/**
 * Leaderboard V3 React Query Hooks
 *
 * Hooks for the manual curation leaderboard system.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  createPost,
  getLeaderboard,
  getAccount,
  calculatePostScorePreview,
} from '../services/leaderboardV3Api';
import type {
  CreatePostRequest,
  GetLeaderboardParams,
  AccountRole,
  ContentSignal,
  PostType,
} from '../types/leaderboard-v3';

// Query keys
export const leaderboardV3Keys = {
  all: ['leaderboard-v3'] as const,
  leaderboard: (params: GetLeaderboardParams) =>
    [...leaderboardV3Keys.all, 'rankings', params] as const,
  account: (username: string, platform: string) =>
    [...leaderboardV3Keys.all, 'account', username, platform] as const,
};

/**
 * Hook for fetching leaderboard rankings
 */
export function useLeaderboardV3(params: GetLeaderboardParams = {}) {
  return useQuery({
    queryKey: leaderboardV3Keys.leaderboard(params),
    queryFn: () => getLeaderboard(params),
    staleTime: 5 * 60 * 1000, // 5 minutes (matches API cache)
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook for fetching account details (for auto-prefill)
 */
export function useLeaderboardV3Account(
  username: string | null,
  platform: string = 'twitter',
  enabled: boolean = true
) {
  return useQuery({
    queryKey: leaderboardV3Keys.account(username || '', platform),
    queryFn: () => getAccount(username!, platform),
    enabled: enabled && !!username && username.length > 0,
    staleTime: 60 * 1000, // 1 minute
    retry: false, // Don't retry on 404
  });
}

// Admin password from environment variable
const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD || '';

/**
 * Hook for creating a new post entry
 * Uses admin password from environment variable
 */
export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      request,
      adminUsername,
    }: {
      request: CreatePostRequest;
      adminUsername?: string;
    }) => createPost(request, ADMIN_PASSWORD, adminUsername),
    onSuccess: () => {
      // Invalidate all leaderboard queries to refresh rankings
      queryClient.invalidateQueries({ queryKey: leaderboardV3Keys.all });
    },
  });
}

/**
 * Hook for admin post submission form state
 * Phase 9: Added postType with persistent selection (not reset between submissions)
 */
export function usePostSubmissionForm() {
  const [postUrl, setPostUrl] = useState('');
  const [accountRole, setAccountRole] = useState<AccountRole>('default');
  const [contentSignals, setContentSignals] = useState<ContentSignal[]>([]);
  const [postType, setPostType] = useState<PostType>('original'); // Phase 9: Post type

  const scorePreview = calculatePostScorePreview(accountRole, contentSignals);

  const toggleSignal = useCallback((signal: ContentSignal) => {
    setContentSignals((prev) =>
      prev.includes(signal)
        ? prev.filter((s) => s !== signal)
        : [...prev, signal]
    );
  }, []);

  // Reset form but preserve postType (user requested: persist selection)
  const reset = useCallback(() => {
    setPostUrl('');
    setAccountRole('default');
    setContentSignals([]);
    // NOTE: postType is intentionally NOT reset to preserve user's selection
  }, []);

  return {
    // Form state
    postUrl,
    setPostUrl,
    accountRole,
    setAccountRole,
    contentSignals,
    setContentSignals,
    toggleSignal,
    postType, // Phase 9
    setPostType, // Phase 9

    // Score preview
    scorePreview,

    // Actions
    reset,

    // Build request
    buildRequest: (): CreatePostRequest => ({
      postUrl,
      accountRole,
      contentSignals,
      postType, // Phase 9
    }),
  };
}

/**
 * Hook for keyboard shortcuts in admin form
 */
export function usePostFormKeyboardShortcuts(
  form: ReturnType<typeof usePostSubmissionForm>,
  onSubmit: () => void,
  inputRef: React.RefObject<HTMLInputElement | null>
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if focused on input/textarea
      const activeElement = document.activeElement;
      const isInputFocused =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      // Post type shortcuts (1, 2, 3) - only when not in input
      if (!isInputFocused) {
        if (e.key === '1') {
          e.preventDefault();
          form.setPostType('original');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          form.setPostType('quote');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          form.setPostType('reply');
          return;
        }

        // Role shortcuts (Q, W, E) - only when not in input
        if (e.key.toLowerCase() === 'q') {
          e.preventDefault();
          form.setAccountRole('default');
          return;
        }
        if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          form.setAccountRole('proactive_ct');
          return;
        }
        if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          form.setAccountRole('kol');
          return;
        }

        // Signal shortcuts (A, S, D) - only when not in input
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          form.toggleSignal('insight');
          return;
        }
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          form.toggleSignal('creative');
          return;
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          form.toggleSignal('high_reach');
          return;
        }

        // Focus URL input (/)
        if (e.key === '/') {
          e.preventDefault();
          inputRef.current?.focus();
          return;
        }
      }

      // Submit (Ctrl+Enter or Cmd+Enter)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit();
        return;
      }
    },
    [form, onSubmit, inputRef]
  );

  return { handleKeyDown };
}
