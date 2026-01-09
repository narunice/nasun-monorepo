import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin } from '@nasun/wallet';
import { fetchUserTickets } from '../lib/lottery-client';
import type { Ticket } from '../types';

export interface UseMyTicketsResult {
  tickets: Ticket[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMyTickets(roundId?: string): UseMyTicketsResult {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();

  // Determine active wallet address (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const address = isZkLoggedIn ? zkState?.address : (isLocalWalletActive ? account?.address : undefined);

  const {
    data: tickets = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['my-lottery-tickets', address, roundId],
    queryFn: () => (address ? fetchUserTickets(address, roundId) : []),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  return {
    tickets,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
