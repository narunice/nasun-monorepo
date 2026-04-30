import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { EcosystemProfile } from '@nasun/profile-core';
import { fetchPublicProfile, type FetchProfileOptions } from './api.js';

const FIVE_MIN = 5 * 60 * 1000;

/**
 * Read-only ecosystem profile by wallet address.
 *
 * All apps in the Nasun ecosystem (nasun-website, pado, gostop, explorer)
 * should consume this hook for displaying any user's name/avatar. The hook
 * delegates fetching to the nasun-website public profile endpoint, which is
 * the single source of truth for display name and avatar.
 *
 * Caching:
 *   - 5 min staleTime (consistent with the global QueryClient default).
 *   - refetchOnWindowFocus: caller may override per-call.
 *
 * Cross-device freshness is guaranteed by:
 *   1. focus refetch (this hook),
 *   2. nasun-website Lambda PATCH → invalidate webhook to chat-server &
 *      explorer-api (their backend caches converge in <5s on success),
 *   3. each app's own backend cache TTL fallback (5 min).
 */
export function useProfile(
  walletAddress: string | undefined | null,
  options: FetchProfileOptions & {
    /** Defaults to true (focus refetch enabled). */
    refetchOnWindowFocus?: boolean | 'always';
    /** Override staleTime in ms. Defaults to 5 min. */
    staleTime?: number;
  },
): UseQueryResult<EcosystemProfile | null> {
  const { endpoint, fetcher, refetchOnWindowFocus, staleTime } = options;
  return useQuery<EcosystemProfile | null>({
    queryKey: ['ecosystem', 'profile', walletAddress ?? null],
    queryFn: () => fetchPublicProfile(walletAddress!, { endpoint, fetcher }),
    enabled: !!walletAddress,
    staleTime: staleTime ?? FIVE_MIN,
    refetchOnWindowFocus: refetchOnWindowFocus ?? true,
  });
}
