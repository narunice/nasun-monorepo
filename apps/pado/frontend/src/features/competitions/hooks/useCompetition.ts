import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import type { CompetitionDetail, CompetitionResultsResponse } from '../types';

async function fetchCompetition(id: string): Promise<CompetitionDetail> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    throw new Error('Chat HTTP URL not configured');
  }

  const url = `${baseUrl}/api/competitions/${encodeURIComponent(id)}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Competition API error: ${res.status}`);
  }

  return res.json();
}

async function fetchCompetitionResults(id: string, limit: number): Promise<CompetitionResultsResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    throw new Error('Chat HTTP URL not configured');
  }

  const params = new URLSearchParams({ limit: String(limit) });
  const url = `${baseUrl}/api/competitions/${encodeURIComponent(id)}/results?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Competition results API error: ${res.status}`);
  }

  return res.json();
}

export function useCompetition(id: string | null) {
  return useQuery<CompetitionDetail>({
    queryKey: ['competition', id],
    queryFn: () => fetchCompetition(id!),
    enabled: !!id && !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useCompetitionResults(id: string | null, limit: number = 100) {
  return useQuery<CompetitionResultsResponse>({
    queryKey: ['competitionResults', id, limit],
    queryFn: () => fetchCompetitionResults(id!, limit),
    enabled: !!id && !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
