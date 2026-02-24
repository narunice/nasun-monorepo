/**
 * useAERResult - Fetches stored AI execution result text from Lambda.
 * Results have a 7-day TTL in DynamoDB.
 */

import { useQuery } from '@tanstack/react-query';
import { BARAM_CONFIG } from '@/config/network';

export interface AERResultData {
  requestId: number;
  result: string;
  resultHash: string;
  model: string;
  purpose: string;
  createdAt: number;
  expiresAt: number;
}

export function useAERResult(requestId: number | null, authorizer: string | null) {
  return useQuery({
    queryKey: ['aer', 'result', requestId],
    queryFn: async (): Promise<AERResultData> => {
      const url = `${BARAM_CONFIG.backendUrl}/result?requestId=${requestId}&authorizer=${encodeURIComponent(authorizer!)}`;
      const headers: Record<string, string> = {};
      if (BARAM_CONFIG.apiKey) {
        headers['x-api-key'] = BARAM_CONFIG.apiKey;
      }
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.status === 404) throw new Error('EXPIRED');
      if (!res.ok) throw new Error(`Failed to fetch result: ${res.status}`);
      return res.json();
    },
    enabled: !!requestId && !!authorizer,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    retryDelay: 1000,
  });
}
