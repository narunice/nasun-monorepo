/**
 * useTokenPrices - react-query wrapper around oracleClient.fetchBatchPrices.
 *
 * Returns one entry per token used by Pado spot (NBTC/NETH/NSN; NUSDC is a
 * stablecoin pinned to $1). One RPC round-trip per refresh shared across all
 * card subscribers via react-query cache + oracleClient's in-flight dedup.
 *
 * Used by the Trading Performance card to mark agent spot holdings to market.
 */
import { useQuery } from '@tanstack/react-query';
import { suiClient } from '@/lib/sui-client';
import { fetchBatchPrices, type OraclePrice } from '../services/oracleClient';

/** Tokens this hook serves prices for. NUSDC is hardcoded to $1 (stablecoin). */
export type SpotTokenSymbol = 'NBTC' | 'NETH' | 'NSN' | 'NSOL' | 'NUSDC';

export interface TokenPriceMap {
  /** Spot mid-price in USD; null when oracle has no fresh feed for that symbol. */
  prices: Record<SpotTokenSymbol, number | null>;
  /** Per-token age in ms from now; null when oracle has no feed. */
  ages: Record<SpotTokenSymbol, number | null>;
  isLoading: boolean;
}

const REFRESH_MS = 30_000;
const STALE_MS = 15_000;

function priceFromOracle(p: OraclePrice | null): number | null {
  return p?.price ?? null;
}

function ageFromOracle(p: OraclePrice | null, now: number): number | null {
  if (!p) return null;
  return now - p.timestampMs;
}

export function useTokenPrices(): TokenPriceMap {
  const { data, isLoading } = useQuery({
    queryKey: ['nasun-ai', 'tokenPrices'],
    queryFn: () => fetchBatchPrices(suiClient),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    staleTime: STALE_MS,
  });

  const now = Date.now();
  const btc = data?.BTCUSD ?? null;
  const eth = data?.ETHUSD ?? null;
  const nsn = data?.NASUSD ?? null;
  const nsol = data?.SOLUSD ?? null;

  return {
    prices: {
      NBTC: priceFromOracle(btc),
      NETH: priceFromOracle(eth),
      NSN: priceFromOracle(nsn),
      NSOL: priceFromOracle(nsol),
      NUSDC: 1,
    },
    ages: {
      NBTC: ageFromOracle(btc, now),
      NETH: ageFromOracle(eth, now),
      NSN: ageFromOracle(nsn, now),
      NSOL: ageFromOracle(nsol, now),
      NUSDC: 0,
    },
    isLoading,
  };
}
