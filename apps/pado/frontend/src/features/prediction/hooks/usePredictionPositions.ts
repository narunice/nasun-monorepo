/**
 * usePredictionPositions Hook
 * Fetches user's prediction market positions (Position NFTs)
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import type { SuiObjectResponse } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { POSITION_TYPES, NUSDC_DECIMALS } from '../constants';
import type { Position } from '../types';

/**
 * Parse Position object from Sui response
 */
function parsePosition(obj: SuiObjectResponse): Position & { _version: bigint } {
  const data = obj.data;
  const content = data?.content;
  const fields = content && 'fields' in content ? (content.fields as Record<string, unknown>) : undefined;

  // `version` is a Sui-internal monotonic counter assigned at creation/mutation
  // time. Newer Position NFTs have higher versions, so sorting desc puts the
  // user's most recent purchase at the top of the list. Stored as bigint to
  // avoid Number precision loss at high checkpoints.
  return {
    id: data?.objectId || '',
    marketId: (fields?.market_id as string) || '',
    isYes: (fields?.is_yes as boolean) ?? true,
    shares: BigInt((fields?.shares as string | number) || 0),
    costBasis: BigInt((fields?.cost_basis as string | number) || 0),
    _version: BigInt(data?.version ?? 0),
  };
}

/**
 * Format amount from smallest units to display units
 */
export function formatPositionAmount(amount: bigint): string {
  const divisor = BigInt(10 ** NUSDC_DECIMALS);
  const whole = amount / divisor;
  const fraction = amount % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(NUSDC_DECIMALS, '0');
  const trimmedFraction = fractionStr.replace(/0+$/, '');
  return `${whole}.${trimmedFraction}`;
}

/**
 * Bucket key for grouping Positions by (marketId, isYes). Same-bucket
 * Positions are merge-eligible — they represent the same economic exposure
 * fragmented across multiple on-chain Position NFT objects (which happens
 * when a resting buy maker is filled by multiple taker sells over time).
 */
export type PositionBucketKey = string;

export function positionBucketKey(marketId: string, isYes: boolean): PositionBucketKey {
  return `${marketId}:${isYes ? 'Y' : 'N'}`;
}

export interface UsePredictionPositionsResult {
  positions: Position[];
  /**
   * Positions grouped by (marketId, isYes). Use this when emitting a sell or
   * claim PTB to detect fragmentation and prepend a `merge_positions` call
   * (see `buildBucketPositionArg` / `buildMergePositionsChained`).
   */
  positionsByBucket: Map<PositionBucketKey, Position[]>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch user's prediction market positions
 * @param marketId - Optional market ID to filter positions
 */
export function usePredictionPositions(marketId?: string): UsePredictionPositionsResult {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const adaptiveInterval = useAdaptiveInterval(60_000);

  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const passkeyAddress = usePasskeyStore((s) => s.address);

  // Determine active address (zkLogin takes priority)
  const address = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : (isPasskeyUnlocked ? passkeyAddress ?? undefined : undefined);
  const isConnected = (status === 'unlocked' && account) || isZkConnected || isPasskeyUnlocked;

  // marketId is deliberately absent from the key: the fetch is identical for
  // every market and only the filter below differs, so keying on it would run
  // one full scan per distinct market a mounted component asks for. With the
  // page cap raised to 10,000 objects, that duplication is the difference
  // between one scan and several that can outlast the refetch interval.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prediction-positions', address],
    queryFn: async (): Promise<Position[]> => {
      if (!address) return [];

      const client = getSuiClient();

      // Paginate through ALL Position NFTs owned by the user. Sui's
      // getOwnedObjects returns 50 per page by default; users with > 50
      // positions across markets would silently see a truncated list.
      //
      // The cap was 20 pages (1,000 objects), which is well under what active
      // accounts actually hold: a 2026-07-30 report came from an account with
      // 4,167 Position objects, because every fill mints a new one and they are
      // only merged on claim. Truncation is not a cosmetic "long tail is
      // missing" problem either, since getOwnedObjects does not promise any
      // particular order and the newest-first sort below runs on what was
      // fetched. A position filled seconds ago can sit past the cut and never
      // render, which reads as "my position vanished".
      const all: ReturnType<typeof parsePosition>[] = [];
      let cursor: string | null | undefined = undefined;
      const MAX_PAGES = 200;
      // 2026-05-20 v5 cutover: filter accepts BOTH legacy and v5 Position
      // types so users with positions split across the cutover see them all.
      // When there is no legacy block (e.g. tests), POSITION_TYPES is a
      // single-element array and MatchAny collapses to StructType behavior.
      const filter =
        POSITION_TYPES.length === 1
          ? { StructType: POSITION_TYPES[0] }
          : { MatchAny: POSITION_TYPES.map((t) => ({ StructType: t })) };
      let truncated = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await client.getOwnedObjects({
          owner: address,
          filter,
          options: { showContent: true },
          cursor,
        });
        for (const obj of response.data) all.push(parsePosition(obj));
        if (!response.hasNextPage || !response.nextCursor) break;
        cursor = response.nextCursor;
        if (page === MAX_PAGES - 1) truncated = true;
      }

      // Hitting the cap still hides positions, so say so rather than silently
      // rendering a partial portfolio as if it were complete.
      if (truncated) {
        console.warn(
          `[usePredictionPositions] cap reached at ${all.length} positions for ${address}; ` +
            'the list is incomplete. Claiming merges positions and shrinks this count.'
        );
      }

      // Newest first (by Sui object version — assigned at mint time).
      all.sort((a, b) => (b._version > a._version ? 1 : b._version < a._version ? -1 : 0));

      // Drop the internal `_version` from the returned shape.
      // Drop fully-emptied Position NFTs (shares = 0) and dust positions below
      // 0.005 NUSDC (5000 raw units). Dust accumulates when placeSellTaker with
      // rest=true partially fills a taker order and the remaining shares are
      // negligible — they pass the > 0 check but render as "0" in the UI with
      // a misleading avg price of 1.00 NUSDC.
      const DUST_THRESHOLD = BigInt(10 ** NUSDC_DECIMALS) / 200n; // 0.005 NUSDC
      return all
        .filter((p) => p.shares >= DUST_THRESHOLD)
        .map(({ _version: _v, ...p }) => p);
    },
    enabled: isConnected && !!address,
    // EventService bridge invalidates on user's own OrderFilled / TokensMinted /
    // WinningsClaimed / MarketResolved (positions become claimable). The
    // invalidate-driven refetch bypasses staleTime, so 30s here is a safety
    // net for the case where the bridge isn't mounted (user navigated away
    // before the indexer caught up). usePredictionTrade also fires a +5s
    // delayed invalidate to absorb owned-objects indexer lag (5-8s typical).
    staleTime: 30_000,
    refetchInterval: adaptiveInterval,
  });

  // Market filtering moved out of the query so every market shares one fetch.
  const positions = useMemo(() => {
    const all = data ?? [];
    return marketId ? all.filter((p) => p.marketId === marketId) : all;
  }, [data, marketId]);

  const positionsByBucket = new Map<PositionBucketKey, Position[]>();
  for (const p of positions) {
    const key = positionBucketKey(p.marketId, p.isYes);
    const arr = positionsByBucket.get(key);
    if (arr) {
      arr.push(p);
    } else {
      positionsByBucket.set(key, [p]);
    }
  }

  return {
    positions,
    positionsByBucket,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to get total position value for a market
 */
export function usePositionValue(positions: Position[], currentPrice: number): {
  totalShares: bigint;
  totalCost: bigint;
  currentValue: bigint;
  pnl: bigint;
  pnlPercent: number;
} {
  const totalShares = positions.reduce((sum, p) => sum + p.shares, 0n);
  const totalCost = positions.reduce((sum, p) => sum + p.costBasis, 0n);

  // Current value = shares * currentPrice (price is in basis points, so divide by 10000)
  const currentValue = (totalShares * BigInt(Math.floor(currentPrice * 100))) / 10000n;

  const pnl = currentValue - totalCost;
  const pnlPercent = totalCost > 0n
    ? Number((pnl * 10000n) / totalCost) / 100
    : 0;

  return {
    totalShares,
    totalCost,
    currentValue,
    pnl,
    pnlPercent,
  };
}
