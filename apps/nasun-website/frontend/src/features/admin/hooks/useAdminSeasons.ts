/**
 * useAdminSeasons - Admin season management hooks
 *
 * Provides CRUD operations for season management.
 * Requires Cognito JWT authentication.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Season, CreateSeasonRequest, UpdateSeasonRequest } from '../types/leaderboard-v3';
import { useAdminAuth } from './useAdminAuth';

const LEADERBOARD_V3_API_URL = import.meta.env.VITE_LEADERBOARD_V3_API_URL;

// Helper to get auth headers
function getAuthHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ============================================
// API Functions
// ============================================

async function fetchAdminSeasons(token: string): Promise<Season[]> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons`, {
    method: 'GET',
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to fetch seasons: ${response.status}`);
  }

  const data = await response.json();
  return data.seasons || [];
}

async function createSeasonApi(token: string, request: CreateSeasonRequest): Promise<Season> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons`, {
    method: 'POST',
    headers: getAuthHeaders(token),
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
  token: string,
  seasonId: string,
  request: UpdateSeasonRequest
): Promise<Season> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(token),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to update season: ${response.status}`);
  }

  const data = await response.json();
  return data.season;
}

async function deleteSeasonApi(token: string, seasonId: string): Promise<void> {
  const response = await fetch(`${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(token),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to delete season: ${response.status}`);
  }
}

async function activateSeasonApi(token: string, seasonId: string): Promise<Season> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}/activate`,
    {
      method: 'POST',
      headers: getAuthHeaders(token),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Failed to activate season: ${response.status}`);
  }

  const data = await response.json();
  return data.season;
}

async function endSeasonApi(token: string, seasonId: string): Promise<Season> {
  const response = await fetch(
    `${LEADERBOARD_V3_API_URL}/v3/admin/seasons/${seasonId}/end`,
    {
      method: 'POST',
      headers: getAuthHeaders(token),
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
  const { cognitoToken } = useAdminAuth();

  // Query: Fetch all seasons
  const {
    data: seasons,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['admin-seasons'],
    queryFn: () => fetchAdminSeasons(cognitoToken!),
    enabled: !!cognitoToken,
    staleTime: 1000 * 60, // 1 minute
  });

  // Mutation: Create season
  const createMutation = useMutation({
    mutationFn: (request: CreateSeasonRequest) => createSeasonApi(cognitoToken!, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: Update season
  const updateMutation = useMutation({
    mutationFn: ({ seasonId, ...request }: UpdateSeasonRequest & { seasonId: string }) =>
      updateSeasonApi(cognitoToken!, seasonId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: Delete season
  const deleteMutation = useMutation({
    mutationFn: (seasonId: string) => deleteSeasonApi(cognitoToken!, seasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
    },
  });

  // Mutation: Activate season
  const activateMutation = useMutation({
    mutationFn: (seasonId: string) => activateSeasonApi(cognitoToken!, seasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-v3'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
    },
  });

  // Mutation: End season
  const endMutation = useMutation({
    mutationFn: (seasonId: string) => endSeasonApi(cognitoToken!, seasonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-seasons'] });
      queryClient.invalidateQueries({ queryKey: ['seasons'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard-v3'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-stats'] });
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
