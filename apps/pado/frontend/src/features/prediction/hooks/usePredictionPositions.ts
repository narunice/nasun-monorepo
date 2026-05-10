/**
 * usePredictionPositions Hook
 * Fetches user's prediction market positions (Position NFTs)
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet, useZkLogin, usePasskeyStore } from '@nasun/wallet';
import type { SuiObjectResponse } from '@mysten/sui/client';
import { getSuiClient } from '../../../lib/sui-client';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { POSITION_TYPE, NUSDC_DECIMALS } from '../constants';
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

export interface UsePredictionPositionsResult {
  positions: Position[];
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['prediction-positions', address, marketId],
    queryFn: async (): Promise<Position[]> => {
      if (!address) return [];

      const client = getSuiClient();

      // Paginate through ALL Position NFTs owned by the user. Sui's
      // getOwnedObjects returns 50 per page by default; users with > 50
      // positions across markets would silently see a truncated list.
      // Cap at 1000 (20 pages) to avoid pathological loops.
      const all: ReturnType<typeof parsePosition>[] = [];
      let cursor: string | null | undefined = undefined;
      const MAX_PAGES = 20;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await client.getOwnedObjects({
          owner: address,
          filter: { StructType: POSITION_TYPE },
          options: { showContent: true },
          cursor,
        });
        for (const obj of response.data) all.push(parsePosition(obj));
        if (!response.hasNextPage || !response.nextCursor) break;
        cursor = response.nextCursor;
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
      const positions: Position[] = all
        .filter((p) => p.shares >= DUST_THRESHOLD)
        .map(({ _version: _v, ...p }) => p);

      // Filter by market if specified
      if (marketId) {
        return positions.filter(p => p.marketId === marketId);
      }
      return positions;
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

  return {
    positions: data || [],
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
