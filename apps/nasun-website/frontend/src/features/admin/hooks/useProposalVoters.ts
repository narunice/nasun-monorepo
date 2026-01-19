import { useQuery } from '@tanstack/react-query';
import { useSuiClient } from '@mysten/dapp-kit';
import { DynamicFieldPage } from '@mysten/sui/client';
import { parseVoterRecord } from '../utils/suiParsers';
import type { VoterRecord } from '../types';

const VOTERS_QUERY_KEY = 'proposal-voters';

export function useProposalVoters(votersTableId: string | null) {
  const suiClient = useSuiClient();

  return useQuery<VoterRecord[]>({
    queryKey: [VOTERS_QUERY_KEY, votersTableId],
    queryFn: async () => {
      if (!votersTableId) return [];

      const voterRecords: VoterRecord[] = [];
      let cursor: string | null = null;

      // Paginate through all dynamic fields in voters table
      do {
        const page: DynamicFieldPage = await suiClient.getDynamicFields({
          parentId: votersTableId,
          cursor,
          limit: 50,
        });

        // Fetch each voter's data
        for (const field of page.data) {
          const voterData = await suiClient.getDynamicFieldObject({
            parentId: votersTableId,
            name: field.name,
          });

          const voter = parseVoterRecord(field.name, voterData.data);
          if (voter) {
            voterRecords.push(voter);
          }
        }

        cursor = page.hasNextPage ? page.nextCursor ?? null : null;
      } while (cursor);

      return voterRecords;
    },
    enabled: !!votersTableId,
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}
