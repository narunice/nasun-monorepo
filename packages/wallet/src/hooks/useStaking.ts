/**
 * useStaking Hook
 * Query staking data for the connected wallet
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from './useWallet';
import { useZkLogin } from './useZkLogin';
import { usePasskeyStore } from '../stores/passkeyStore';
import { getStakes, calculateStakingSummary } from '../sui/staking';
import type { DelegatedStake, StakingSummary } from '../types/staking';

// Query key prefix for staking queries
const STAKING_QUERY_KEY = 'nasun-wallet-staking';

// Polling interval
const DEFAULT_POLLING_INTERVAL = 30_000; // 30 seconds

export interface UseStakingOptions {
  /** Disable automatic fetching */
  enabled?: boolean;
  /** Polling interval in milliseconds (default: 30000) */
  pollingInterval?: number;
}

export interface UseStakingResult {
  /** Delegated stakes grouped by validator */
  stakes: DelegatedStake[];
  /** Staking summary */
  summary: StakingSummary;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch function */
  refetch: () => void;
}

// Empty summary for initial state
const EMPTY_SUMMARY: StakingSummary = {
  totalStaked: 0n,
  totalRewards: 0n,
  activeStakeCount: 0,
  pendingStakeCount: 0,
  formattedTotalStaked: '0',
  formattedTotalRewards: '0',
};

/**
 * Hook to get staking data for connected wallet
 */
export function useStaking(options: UseStakingOptions = {}): UseStakingResult {
  const { account, status } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const { enabled = true, pollingInterval = DEFAULT_POLLING_INTERVAL } = options;

  // Support mnemonic wallet, zkLogin, and passkey
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const walletAddress = account?.address || zkState?.address || passkeyAddress;
  const isWalletUnlocked = status === 'unlocked' && Boolean(account?.address);
  const isConnected = isWalletUnlocked || isZkConnected || isPasskeyUnlocked;

  const query = useQuery({
    queryKey: [STAKING_QUERY_KEY, walletAddress],
    queryFn: async () => {
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }
      const stakes = await getStakes(walletAddress);
      const summary = calculateStakingSummary(stakes);
      return { stakes, summary };
    },
    enabled: enabled && isConnected && Boolean(walletAddress),
    refetchInterval: pollingInterval,
    staleTime: 10_000, // 10 seconds
  });

  return {
    stakes: query.data?.stakes || [],
    summary: query.data?.summary || EMPTY_SUMMARY,
    isLoading: query.isLoading,
    error: query.error ? String(query.error) : null,
    refetch: query.refetch,
  };
}

/**
 * Hook to refresh staking data
 */
export function useRefreshStaking() {
  const { account } = useWallet();
  const { state: zkState } = useZkLogin();
  const passkeyAddress = usePasskeyStore((s) => s.address);
  const queryClient = useQueryClient();

  return () => {
    const address = account?.address || zkState?.address || passkeyAddress;
    if (address) {
      queryClient.invalidateQueries({
        queryKey: [STAKING_QUERY_KEY, address],
      });
    }
  };
}

/**
 * Hook to invalidate staking cache (for external use)
 */
export function useInvalidateStaking() {
  const queryClient = useQueryClient();

  return (address?: string) => {
    if (address) {
      queryClient.invalidateQueries({
        queryKey: [STAKING_QUERY_KEY, address],
      });
    } else {
      queryClient.invalidateQueries({
        queryKey: [STAKING_QUERY_KEY],
      });
    }
  };
}
