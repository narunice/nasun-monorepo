import { useRecentFills } from './useRecentFills';

/**
 * Most recent fill price expressed in YES bps (0-10000).
 * NO trades are converted: YES_bps = 10000 - NO_price.
 * Returns null when no fills are available.
 */
export function useLastTradePrice(marketId: string | undefined): number | null {
  const { data: fills } = useRecentFills(marketId);
  if (!fills || fills.length === 0) return null;
  const f = fills[0];
  return f.isYes ? f.price : 10000 - f.price;
}
