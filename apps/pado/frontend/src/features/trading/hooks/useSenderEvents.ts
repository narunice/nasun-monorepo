/**
 * useSenderEvents - Shared hook for querying Sender events
 *
 * Both useMyTrades and useOrderHistory need the same queryEvents RPC call.
 * This hook consolidates them into a single useInfiniteQuery, cutting
 * duplicate RPC calls by half.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import type { SuiEvent, EventId } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';

export interface SenderEventsPage {
  events: SuiEvent[];
  nextCursor: EventId | null | undefined;
  hasNextPage: boolean;
}

async function fetchSenderEventsPage(
  senderAddress: string,
  cursor: EventId | null,
): Promise<SenderEventsPage> {
  const client = getSuiClient();
  const result = await client.queryEvents({
    query: { Sender: senderAddress },
    limit: 200,
    order: 'descending',
    cursor: cursor ?? undefined,
  });

  return {
    events: result.data,
    nextCursor: result.nextCursor,
    hasNextPage: result.hasNextPage,
  };
}

export function useSenderEvents(senderAddress: string | undefined) {
  const adaptiveInterval = useAdaptiveInterval(10_000);

  return useInfiniteQuery({
    queryKey: ['sender-events', senderAddress],
    queryFn: ({ pageParam }) =>
      fetchSenderEventsPage(senderAddress!, pageParam),
    initialPageParam: null as EventId | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.nextCursor : undefined,
    enabled: !!senderAddress,
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
  });
}
