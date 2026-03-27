import { useQuery } from '@tanstack/react-query';
import { fetchBinanceCandles, getBinanceSymbol } from '@/lib/indicators';

/**
 * Fetch 24h price sparkline data for a token via Binance 1h klines.
 * Returns close prices only (for SVG rendering).
 * Tokens without Binance mapping (NSN) return empty array.
 */
export function useTokenSparkline(tokenSymbol: string) {
  const binanceSymbol = getBinanceSymbol(tokenSymbol);

  return useQuery({
    queryKey: ['sparkline', tokenSymbol],
    queryFn: async (): Promise<number[]> => {
      if (!binanceSymbol) return [];
      const candles = await fetchBinanceCandles(binanceSymbol, '1h', 24);
      if (!candles) return [];
      return candles.map((c) => c.close);
    },
    enabled: !!binanceSymbol,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
