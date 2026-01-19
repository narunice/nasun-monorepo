import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSuiClient, useSuiClientQuery } from '@mysten/dapp-kit';
import { useNetworkVariable } from '@/config/suiNetworkConfig';
import { getDashboardProposalIds, parseProposalSummary } from '../utils/suiParsers';
import type { ProposalSummary } from '../types';

const PROPOSALS_QUERY_KEY = 'admin-proposals';

export function useAdminProposals() {
  const dashboardId = useNetworkVariable('dashboardId');
  const suiClient = useSuiClient();

  // Fetch Dashboard object
  const { data: dashboardData, isPending: isDashboardPending } = useSuiClientQuery('getObject', {
    id: dashboardId,
    options: { showContent: true },
  });

  // Extract proposal IDs from dashboard
  const proposalIds = getDashboardProposalIds(dashboardData?.data);

  // Fetch all proposals
  const proposalsQuery = useQuery<ProposalSummary[]>({
    queryKey: [PROPOSALS_QUERY_KEY, dashboardId, proposalIds.join(',')],
    queryFn: async () => {
      if (proposalIds.length === 0) return [];

      const proposalPromises = proposalIds.map(async (id) => {
        const res = await suiClient.getObject({ id, options: { showContent: true } });
        return parseProposalSummary(res.data);
      });

      const results = await Promise.all(proposalPromises);
      return results.filter((p): p is ProposalSummary => p !== null);
    },
    enabled: proposalIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    data: proposalsQuery.data ?? [],
    isLoading: isDashboardPending || proposalsQuery.isLoading,
    isPending: isDashboardPending || proposalsQuery.isPending,
    error: proposalsQuery.error,
    refetch: proposalsQuery.refetch,
  };
}

export function useInvalidateProposals() {
  const queryClient = useQueryClient();
  const dashboardId = useNetworkVariable('dashboardId');

  return () => queryClient.invalidateQueries({ queryKey: [PROPOSALS_QUERY_KEY, dashboardId] });
}
