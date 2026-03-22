import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSuiClient, useSuiClientQuery } from '@mysten/dapp-kit';
import { useNetworkVariable } from '@/config/suiNetworkConfig';
import { getDashboardProposalIds, parseProposalSummary } from '../utils/suiParsers';
import type { ProposalSummary, ProposalType } from '../types';

const PROPOSALS_QUERY_KEY = 'admin-proposals';
const PROPOSAL_TYPE_REGISTRY_ID = import.meta.env.VITE_PROPOSAL_TYPE_REGISTRY_ID;

export function useAdminProposals() {
  const dashboardId = useNetworkVariable('dashboardId');
  const suiClient = useSuiClient();

  // Fetch Dashboard object
  const { data: dashboardData, isPending: isDashboardPending } = useSuiClientQuery('getObject', {
    id: dashboardId,
    options: { showContent: true },
  });

  // Get ProposalTypeRegistry to resolve types table ID
  const { data: registryData } = useSuiClientQuery('getObject', {
    id: PROPOSAL_TYPE_REGISTRY_ID || '0x0',
    options: { showContent: true },
  }, {
    enabled: !!PROPOSAL_TYPE_REGISTRY_ID,
  });

  const typesTableId = registryData?.data?.content?.dataType === 'moveObject'
    ? ((registryData.data.content.fields as Record<string, unknown>).types as { fields: { id: { id: string } } })?.fields?.id?.id
    : null;

  // Extract proposal IDs from dashboard
  const proposalIds = getDashboardProposalIds(dashboardData?.data);

  // Fetch all proposals with type resolution
  const proposalsQuery = useQuery<ProposalSummary[]>({
    queryKey: [PROPOSALS_QUERY_KEY, dashboardId, proposalIds.join(','), typesTableId],
    queryFn: async () => {
      if (proposalIds.length === 0) return [];

      // Reverse IDs so newest proposals (appended last on-chain) come first
      const newestFirst = [...proposalIds].reverse();

      const proposalPromises = newestFirst.map(async (id) => {
        const res = await suiClient.getObject({
          id,
          options: { showContent: true, showPreviousTransaction: true },
        });
        const summary = parseProposalSummary(res.data);
        if (!summary) return null;

        // Resolve proposal type from registry
        if (typesTableId) {
          summary.proposalType = await queryProposalType(id, typesTableId);
        }

        // Fetch creation timestamp
        summary.createdAt = await queryCreationTimestamp(
          id,
          res.data?.previousTransaction
        );

        return summary;
      });

      const results = await Promise.all(proposalPromises);
      return results.filter((p): p is ProposalSummary => p !== null);
    },
    enabled: proposalIds.length > 0,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  async function queryProposalType(proposalId: string, tableId: string): Promise<ProposalType> {
    try {
      const df = await suiClient.getDynamicFieldObject({
        parentId: tableId,
        name: { type: '0x2::object::ID', value: proposalId },
      });

      if (df.data?.content?.dataType === 'moveObject') {
        const fields = df.data.content.fields as Record<string, unknown>;
        const value = fields.value as { variant: string } | undefined;
        if (value?.variant === 'Poll') return 'Poll';
      }
    } catch {
      // Not found in registry = Governance (default)
    }
    return 'Governance';
  }

  async function queryCreationTimestamp(
    proposalId: string,
    previousTxDigest?: string | null
  ): Promise<number | null> {
    // Primary: query earliest transaction that changed this object
    try {
      const txs = await suiClient.queryTransactionBlocks({
        filter: { ChangedObject: proposalId },
        order: 'ascending',
        limit: 1,
        options: { showInput: false, showEffects: false },
      });
      if (txs.data.length > 0 && txs.data[0].timestampMs) {
        return Number(txs.data[0].timestampMs);
      }
    } catch {
      // Devnet indexer may not support queryTransactionBlocks filters
    }

    // Fallback: get timestamp from the object's previousTransaction digest
    if (previousTxDigest) {
      try {
        const tx = await suiClient.getTransactionBlock({
          digest: previousTxDigest,
          options: {},
        });
        if (tx.timestampMs) {
          return Number(tx.timestampMs);
        }
      } catch {
        // Ignore
      }
    }

    return null;
  }

  return {
    data: proposalsQuery.data ?? [],
    isLoading: isDashboardPending || (proposalIds.length > 0 && proposalsQuery.isLoading),
    isPending: isDashboardPending || (proposalIds.length > 0 && proposalsQuery.isPending),
    error: proposalsQuery.error,
    refetch: proposalsQuery.refetch,
  };
}

export function useInvalidateProposals() {
  const queryClient = useQueryClient();
  const dashboardId = useNetworkVariable('dashboardId');

  return () => {
    // Invalidate the proposals list cache
    queryClient.invalidateQueries({ queryKey: [PROPOSALS_QUERY_KEY, dashboardId] });
    // Also invalidate the underlying Dashboard object cache (dapp-kit key: [network, 'getObject', params])
    // so that new proposal IDs are fetched from chain
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[1] === 'getObject' &&
        (query.queryKey[2] as Record<string, unknown> | undefined)?.id === dashboardId,
    });
  };
}
