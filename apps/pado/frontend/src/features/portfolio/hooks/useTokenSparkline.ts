import { useQuery } from '@tanstack/react-query';
import { fetchBinanceCandles, getBinanceSymbol } from '@/lib/indicators';
import { fetchPoolPriceHistory, isTradeApiAvailable } from '@/lib/pado-api';
import { POOLS } from '@/config/network';

const POOL_FOR_TOKEN: Record<string, string | undefined> = {
  NSN: POOLS.NASUN_NUSDC.id,
  NBTC: POOLS.NBTC_NUSDC.id,
  NETH: POOLS.NETH_NUSDC.id,
  NSOL: POOLS.NSOL_NUSDC.id,
};

/**
 * Fetch 24h price sparkline data for a token.
 * - NUSDC: synthetic flat $1 series (stablecoin).
 * - Tokens with Binance mapping (NBTC/NETH/NSOL): Binance 1h klines.
 * - Tokens without Binance mapping (NSN): on-chain pool price history
 *   from chat-server `/api/pado/pool-price-history`.
 */
export function useTokenSparkline(tokenSymbol: string) {
  const binanceSymbol = getBinanceSymbol(tokenSymbol);
  const poolId = POOL_FOR_TOKEN[tokenSymbol];

  return useQuery({
    queryKey: ['sparkline', tokenSymbol],
    queryFn: async (): Promise<number[]> => {
      if (tokenSymbol === 'NUSDC') {
        // Stablecoin: render as flat line (length 24 keeps shape consistent)
        return Array.from({ length: 24 }, () => 1);
      }
      if (binanceSymbol) {
        const candles = await fetchBinanceCandles(binanceSymbol, '1h', 24);
        if (candles && candles.length > 0) return candles.map((c) => c.close);
      }
      if (poolId && isTradeApiAvailable()) {
        const series = await fetchPoolPriceHistory(poolId, 24);
        return series.map((p) => p.close);
      }
      return [];
    },
    enabled: !!tokenSymbol,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
