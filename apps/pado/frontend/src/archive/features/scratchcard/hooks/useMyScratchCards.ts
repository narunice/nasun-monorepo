import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import { fetchPurchaseHistory, fetchUserScratchCards } from '../lib/scratchcard-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import type { ScratchResult, ScratchCard } from '../types';

export interface UseMyScratchCardsResult {
  purchases: ScratchResult[];
  winningNfts: ScratchCard[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  refetchNfts: () => void;
}

function useAddress(): string | undefined {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn, state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);

  const isLocalWalletActive = status === 'unlocked' && !!account?.address;
  return isZkLoggedIn
    ? zkState?.address
    : isLocalWalletActive
      ? account?.address
      : isPasskeyUnlocked
        ? (passkeyAddress ?? undefined)
        : undefined;
}

export function useMyScratchCards(): UseMyScratchCardsResult {
  const address = useAddress();
  const adaptiveInterval = useAdaptiveInterval(30_000);

  // Purchase history (events) for the full history list (wins + losses)
  const { data: purchases, isLoading: purchasesLoading, error: purchasesError, refetch } = useQuery({
    queryKey: ['my-scratchcards', address],
    queryFn: () => (address ? fetchPurchaseHistory(address) : []),
    enabled: !!address,
    staleTime: 10_000,
    refetchInterval: adaptiveInterval,
  });

  // Winning NFTs (on-chain objects) for the winning cards display
  // This is the authoritative source for winning cards (not event-based)
  const { data: winningNfts, isLoading: nftsLoading, error: nftsError, refetch: refetchNfts } = useQuery({
    queryKey: ['my-scratchcard-nfts', address],
    queryFn: () => (address ? fetchUserScratchCards(address) : []),
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: adaptiveInterval,
  });

  return {
    purchases: purchases ?? [],
    winningNfts: winningNfts ?? [],
    isLoading: purchasesLoading || nftsLoading,
    error: (purchasesError ?? nftsError) as Error | null,
    refetch,
    refetchNfts,
  };
}
