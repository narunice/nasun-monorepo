/**
 * useChartData - Fetches candle data from Binance or generates simulated data
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  generateCandleData,
  fetchBinanceCandles,
  getBinanceSymbol,
} from '@/lib/indicators';
import type { TimeInterval } from '../types';
import { INTERVAL_CONFIG } from '../types';

export function useChartData(
  baseSymbol: string,
  interval: TimeInterval,
  currentPrice: number,
) {
  const binanceSymbol = getBinanceSymbol(baseSymbol);
  const { count, ms: intervalMs } = INTERVAL_CONFIG[interval];

  // Fetch real candle data from Binance for supported pairs
  const { data: binanceData } = useQuery({
    queryKey: ['candles', binanceSymbol, interval],
    queryFn: async () => {
      const result = await fetchBinanceCandles(binanceSymbol, interval, count);
      return result ?? [];
    },
    enabled: !!binanceSymbol,
    refetchInterval: intervalMs,
    staleTime: intervalMs / 2,
    placeholderData: (prev) => prev,
  });

  // Fallback: simulated data for tokens without Binance mapping
  const simulatedData = useMemo(() => {
    if (binanceSymbol) return null;
    return generateCandleData(currentPrice, count, intervalMs);
  }, [binanceSymbol, interval, currentPrice]);

  // Use real data if available, otherwise simulated
  const effectiveCandleData =
    binanceSymbol && binanceData && binanceData.length > 0
      ? binanceData
      : (simulatedData ?? []);

  return {
    effectiveCandleData,
    binanceSymbol,
    intervalMs,
  };
}
