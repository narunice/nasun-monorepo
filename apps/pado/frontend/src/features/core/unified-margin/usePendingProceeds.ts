/**
 * usePendingProceeds
 *
 * Surfaces funds that left the BalanceManager but have not come back to it yet:
 * proceeds from filled maker orders and collateral for working orders, both of
 * which live pool-side until the owner touches that pool again. Every other
 * balance view reads the BalanceManager bag, so without this the funds appear
 * nowhere. See features/trading/lib/pendingProceeds.ts for the mechanism.
 *
 * The read is split from the claim action so balance surfaces can total these
 * funds without pulling in transaction signing.
 */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBalanceManagerStore } from '../../trading/stores/balanceManagerStore';
import { useTransactionExecutor } from '../../trading/hooks/useTransactionExecutor';
import {
  getPendingProceeds,
  buildClaimPendingProceeds,
  claimableProceeds,
  type PendingProceeds,
} from '../../trading/lib/pendingProceeds';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { useActiveAddress } from '../../../hooks/useActiveAddress';
import { getStoredBalanceManagerId } from '../../../lib/unified-margin';
import { calculateUsdValue } from '../../../lib/prices';
import type { TokenSymbol } from '../../../lib/prices';

export interface PendingProceedsQuery {
  entries: PendingProceeds[];
  /** Total USD value held pool-side */
  usd: number;
  hasPending: boolean;
  isLoading: boolean;
  refetch: () => void;
}

export interface PendingProceedsState extends PendingProceedsQuery {
  /** Entries that can be pulled back right now (no working orders) */
  claimable: PendingProceeds[];
  isClaiming: boolean;
  claimError: string | null;
  claim: () => Promise<boolean>;
}

function toHuman(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

/**
 * Resolves the manager to inspect from address-keyed storage first.
 *
 * The shared store is only populated once a trading surface has mounted, so
 * relying on it alone would leave balance surfaces (the header total among
 * them) blind to pool-side funds on every other page.
 */
function useResolvedBalanceManagerId(): string | null {
  const activeAddress = useActiveAddress();
  const storeId = useBalanceManagerStore((s) => s.balanceManagerId);
  return (activeAddress ? getStoredBalanceManagerId(activeAddress) : null) ?? storeId;
}

/** Read-only view, safe for balance aggregation. */
export function usePendingProceedsQuery(): PendingProceedsQuery {
  const balanceManagerId = useResolvedBalanceManagerId();
  const adaptiveInterval = useAdaptiveInterval(15_000);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pending-proceeds', balanceManagerId],
    queryFn: () => (balanceManagerId ? getPendingProceeds(balanceManagerId) : Promise.resolve([])),
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
    enabled: !!balanceManagerId,
  });

  const entries = useMemo(() => data ?? [], [data]);

  const usd = useMemo(
    () =>
      entries.reduce((sum, e) => {
        const base = calculateUsdValue(
          e.pool.baseToken.symbol as TokenSymbol,
          toHuman(e.baseRaw, e.pool.baseToken.decimals)
        );
        const quote = calculateUsdValue(
          e.pool.quoteToken.symbol as TokenSymbol,
          toHuman(e.quoteRaw, e.pool.quoteToken.decimals)
        );
        return sum + base + quote;
      }, 0),
    [entries]
  );

  return { entries, usd, hasPending: entries.length > 0, isLoading, refetch };
}

/** Query plus the action to pull settled proceeds back into the trading account. */
export function usePendingProceeds(): PendingProceedsState {
  const balanceManagerId = useResolvedBalanceManagerId();
  const query = usePendingProceedsQuery();
  const { executeTransaction } = useTransactionExecutor();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const claimable = useMemo(() => claimableProceeds(query.entries), [query.entries]);

  const claim = useCallback(async (): Promise<boolean> => {
    if (!balanceManagerId || claimable.length === 0) return false;
    setIsClaiming(true);
    setClaimError(null);
    try {
      const result = await executeTransaction(() =>
        buildClaimPendingProceeds(balanceManagerId, claimable)
      );
      if (!result.success) {
        setClaimError(result.error ?? 'Claim failed');
        return false;
      }
      query.refetch();
      return true;
    } finally {
      setIsClaiming(false);
    }
  }, [balanceManagerId, claimable, executeTransaction, query]);

  return { ...query, claimable, isClaiming, claimError, claim };
}
