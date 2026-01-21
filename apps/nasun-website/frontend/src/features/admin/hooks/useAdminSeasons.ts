/**
 * useAdminSeasons - Admin season management hooks
 *
 * Provides CRUD operations for season management.
 * Requires admin authentication.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Season, CreateSeasonRequest, UpdateSeasonRequest } from '../types/leaderboard-v3';

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;
const ADMIN_PASSWORD = import.meta.env.VITE_LEADERBOARD_V3_ADMIN_PASSWORD;

// Helper to get auth headers
function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ADMIN_PASSWORD}`,
  };
}

// ============================================
// API Functions
// ============================================

async function fetchAdminSeasons(): Promise<Season[]> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch seasons: ${response.status}`);
  }

  const data = await response.json();
  return data.seasons || [];
}

async function createSeasonApi(request: CreateSeasonRequest): Promise<Season> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to create season: ${response.status}`);
  }

  const data = await response.json();
  return data.season;
}

async function updateSeasonApi(
  seasonId: string,
  request: UpdateSeasonRequest
): Promise<Season> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to update season: ${response.status}`);
  }

  const data = await response.json();
  return data.season;
}

async function deleteSeasonApi(seasonId: string): Promise<void> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to delete season: ${response.status}`);
  }
}

async function activateSeasonApi(seasonId: string): Promise<Season> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}/activate`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to activate season: ${response.status}`);
  }

  const data = await response.json();
  return data.season;
}

async function endSeasonApi(seasonId: string): Promise<Season> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}/end`,
    {
      method: 'POST',
      headers: getAuthHeaders(),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to end season: ${response.status}`);
  }

  const data = await response.json();
  return data.season;
}

// ============================================
// React Query Hooks
// ============================================

export function useAdminSeasons() {
  const queryClient = useQueryClient();

  // Query: Fetch all seasons
  const {
    data: seasons,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-seasons'],
    queryFn: fetchAdminSeasons,
    staleTime: 1000 * 60, // 1 minute
  });

  // Mutation: Create season
  const createMutation = useMutation({
    mutationFn: createSeasonApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: Update season
  const updateMutation = useMutation({
    mutationFn: ({ seasonId, ...request }: UpdateSeasonRequest & { seasonId: string }) =>
      updateSeasonApi(seasonId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: Delete season
  const deleteMutation = useMutation({
    mutationFn: deleteSeasonApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: Activate season
  const activateMutation = useMutation({
    mutationFn: activateSeasonApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: End season
  const endMutation = useMutation({
    mutationFn: endSeasonApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  return {
    // Data
    seasons,
    isLoading,
    error,
    refetch,

    // Mutations
    createSeason: createMutation.mutateAsync,
    updateSeason: updateMutation.mutateAsync,
    deleteSeason: deleteMutation.mutateAsync,
    activateSeason: activateMutation.mutateAsync,
    endSeason: endMutation.mutateAsync,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isActivating: activateMutation.isPending,
    isEnding: endMutation.isPending,
  };
}
