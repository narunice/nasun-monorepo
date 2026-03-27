import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { fetchPurchaseHistory } from '../lib/scratchcard-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { ScratchResult } from '../types';

export interface UseMyScratchCardsResult {
  purchases: ScratchResult[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useMyScratchCards(): UseMyScratchCardsResult {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const adaptiveInterval = useAdaptiveInterval(30_000);

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  const address = isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? (passkeyAddress ?? undefined)
        : undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-scratchcards', address],
    queryFn: () => (address ? fetchPurchaseHistory(address) : []),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: adaptiveInterval,
  });

  return {
    purchases: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
