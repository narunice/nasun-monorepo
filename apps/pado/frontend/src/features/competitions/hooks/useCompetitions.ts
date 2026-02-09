import { useQuery } from '@tanstack/react-query';
import { NETWORK_CONFIG } from '../../../config/network';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { CompetitionsListResponse, CompetitionStatus } from '../types';

async function fetchCompetitions(status?: CompetitionStatus): Promise<CompetitionsListResponse> {
  const baseUrl = NETWORK_CONFIG.chatHttpUrl;
  if (!baseUrl) {
    return { competitions: [] };
  }

  const params = new URLSearchParams();
  if (status) params.set('status', status);

  const url = `${baseUrl}/api/competitions${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Competitions API error: ${res.status}`);
  }

  return res.json();
}

export function useCompetitions(status?: CompetitionStatus) {
  const adaptiveInterval = useAdaptiveInterval(60_000);

  return useQuery<CompetitionsListResponse>({
    queryKey: ['competitions', status ?? 'all'],
    queryFn: () => fetchCompetitions(status),
    enabled: !!NETWORK_CONFIG.chatHttpUrl,
    refetchInterval: adaptiveInterval,
    staleTime: 30_000,
  });
}

export function useActiveCompetitions() {
  return useCompetitions('active');
}
