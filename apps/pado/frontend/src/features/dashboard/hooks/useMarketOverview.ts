/**
 * useMarketOverview Hook
 *
 * Fetches live 24h ticker data from Binance for all tradable markets.
 * Populates the global price change cache so other components benefit.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchBinanceMultiTicker, getBinanceSymbol } from '../../../lib/indicators';
import { useAdaptiveInterval } from '../../../hooks/useAdaptiveInterval';
import { getUnifiedPrice, set24hChange, type TokenSymbol } from '../../../lib/prices';

export interface MarketOverviewItem {
  symbol: TokenSymbol;
  name: string;
  pool: string;
  price: number;
  change24h: number | null;
  volume24h: number | null;
}

// Markets to display on the dashboard
const DASHBOARD_MARKETS: Array<{
  symbol: TokenSymbol;
  name: string;
  pool: string;
}> = [
  { symbol: 'NBTC', name: 'Nasun BTC', pool: 'NBTC_NUSDC' },
  { symbol: 'NETH', name: 'Nasun ETH', pool: 'NETH_NUSDC' },
  { symbol: 'NSOL', name: 'Nasun SOL', pool: 'NSOL_NUSDC' },
  { symbol: 'NASUN', name: 'Nasun', pool: 'NASUN_NUSDC' },
];

// Binance symbols for batch fetch (only tokens with Binance mapping)
const BINANCE_SYMBOLS = DASHBOARD_MARKETS
  .map((m) => getBinanceSymbol(m.symbol))
  .filter(Boolean);

export function useMarketOverview(): {
  markets: MarketOverviewItem[];
  isLoading: boolean;
} {
  const adaptiveInterval = useAdaptiveInterval(30_000);

  const { data: tickerMap, isLoading } = useQuery({
    queryKey: ['marketOverview', 'binanceMultiTicker'],
    queryFn: () => fetchBinanceMultiTicker(BINANCE_SYMBOLS),
    refetchInterval: adaptiveInterval,
    staleTime: 15_000,
  });

  // Push real 24h changes into global cache
  useEffect(() => {
    if (!tickerMap) return;
    for (const market of DASHBOARD_MARKETS) {
      const binSym = getBinanceSymbol(market.symbol);
      const ticker = binSym ? tickerMap.get(binSym) : undefined;
      if (ticker) {
        set24hChange(market.symbol, ticker.priceChangePercent);
      }
    }
  }, [tickerMap]);

  const markets: MarketOverviewItem[] = DASHBOARD_MARKETS.map((m) => {
    const binSym = getBinanceSymbol(m.symbol);
    const ticker = binSym && tickerMap ? tickerMap.get(binSym) : undefined;

    return {
      symbol: m.symbol,
      name: m.name,
      pool: m.pool,
      price: getUnifiedPrice(m.symbol),
      change24h: ticker?.priceChangePercent ?? null,
      volume24h: ticker?.quoteVolume ?? null,
    };
  });

  return { markets, isLoading };
}
