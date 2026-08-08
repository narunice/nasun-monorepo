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
  buildClaimAcrossManagers,
  claimableProceeds,
  type PendingProceeds,
} from '../../trading/lib/pendingProceeds';
import { findOwnedBalanceManagerIds } from '../../trading/lib/balanceManagerValidation';
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
 * Every manager to inspect, not just the one this browser happens to remember.
 *
 * Address-keyed storage and the shared store both hold a *single* id, and a
 * user can own more than one BalanceManager. Whichever id was written locally
 * then decides whether pool-side funds are visible at all: a 2026-07-26 report
 * came from an account with two managers, where the one not in storage held
 * 26,157 NUSDC of settled proceeds. Enumerating on chain removes that coin
 * flip. The locally known id is seeded first so the card still works on the
 * first paint, before discovery resolves.
 */
export function useOwnedBalanceManagerIds(): string[] {
  const activeAddress = useActiveAddress();
  const storeId = useBalanceManagerStore((s) => s.balanceManagerId);
  const knownId =
    (activeAddress ? getStoredBalanceManagerId(activeAddress) : null) ?? storeId;

  // Discovery is three RPC sources deep, so it is cached far longer than the
  // balance read that consumes it. The set of managers a user owns effectively
  // never changes; their contents change constantly.
  const { data } = useQuery({
    queryKey: ['owned-balance-managers', activeAddress],
    queryFn: () => (activeAddress ? findOwnedBalanceManagerIds(activeAddress) : Promise.resolve([])),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: !!activeAddress,
  });

  return useMemo(() => {
    const ids = new Set<string>();
    if (knownId) ids.add(knownId);
    for (const id of data ?? []) ids.add(id);
    return [...ids];
  }, [knownId, data]);
}

/** Read-only view, safe for balance aggregation. */
export function usePendingProceedsQuery(): PendingProceedsQuery {
  const balanceManagerIds = useOwnedBalanceManagerIds();
  const adaptiveInterval = useAdaptiveInterval(15_000);
  const idKey = balanceManagerIds.join(',');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pending-proceeds', idKey],
    queryFn: async () => {
      const perManager = await Promise.all(balanceManagerIds.map(getPendingProceeds));
      return perManager.flat();
    },
    refetchInterval: adaptiveInterval,
    staleTime: 5000,
    enabled: balanceManagerIds.length > 0,
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
  const query = usePendingProceedsQuery();
  const { executeTransaction } = useTransactionExecutor();
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const claimable = useMemo(() => claimableProceeds(query.entries), [query.entries]);

  const claim = useCallback(async (): Promise<boolean> => {
    if (claimable.length === 0) return false;
    setIsClaiming(true);
    setClaimError(null);
    try {
      // Each entry carries its own manager, so one transaction can drain
      // proceeds stranded across several of them.
      const result = await executeTransaction(() => buildClaimAcrossManagers(claimable));
      if (!result.success) {
        setClaimError(result.error ?? 'Claim failed');
        return false;
      }
      query.refetch();
      return true;
    } finally {
      setIsClaiming(false);
    }
  }, [claimable, executeTransaction, query]);

  return { ...query, claimable, isClaiming, claimError, claim };
}
