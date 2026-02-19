import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { fetchUserTickets } from '../lib/lottery-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
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
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const adaptiveInterval = useAdaptiveInterval(30_000);

  // Determine active wallet address (zkLogin takes priority)
  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const address = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? passkeyAddress ?? undefined
        : undefined;

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
    refetchInterval: adaptiveInterval,
  });

  return {
    tickets,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
