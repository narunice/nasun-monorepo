/**
 * Perp Market Context
 * Provides selected market state and price data
 * @module features/perp/context/PerpMarketContext
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { usePerpMarket, usePerpMarkets } from '../hooks/usePerpMarket';
import { useOraclePrice } from '../hooks/useOraclePrice';
import type { PerpMarket, PerpMarketDisplay } from '../types';
import { toMarketDisplay } from '../lib/perp-client';
import { PERP_MARKET_BTC, ORACLE_SYMBOL } from '../constants';

interface PerpMarketContextValue {
  // Selected market
  selectedMarketId: string | null;
  selectedMarket: PerpMarket | null;
  selectedMarketDisplay: PerpMarketDisplay | null;
  selectMarket: (marketId: string) => void;

  // All markets
  markets: PerpMarket[];
  marketsLoading: boolean;

  // Current price
  currentPrice: number;
  priceLoading: boolean;
  isPriceStale: boolean;

  // Loading states
  isLoading: boolean;
  error: Error | null;
}

const PerpMarketContext = createContext<PerpMarketContextValue | null>(null);

interface PerpMarketProviderProps {
  children: ReactNode;
  defaultMarketId?: string;
}

export function PerpMarketProvider({
  children,
  defaultMarketId = PERP_MARKET_BTC,
}: PerpMarketProviderProps) {
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(
    defaultMarketId || null,
  );

  // Fetch all markets
  const {
    data: markets = [],
    isLoading: marketsLoading,
    error: marketsError,
  } = usePerpMarkets();

  // Fetch selected market details
  const {
    data: selectedMarket,
    isLoading: marketLoading,
    error: marketError,
  } = usePerpMarket(selectedMarketId ?? undefined);

  // Get oracle symbol from market
  const oracleSymbol = selectedMarket?.baseSymbol ?? ORACLE_SYMBOL.BTC;

  // Fetch current price from oracle
  const {
    data: priceData,
    isLoading: priceLoading,
  } = useOraclePrice(oracleSymbol);

  const currentPrice = priceData?.price ?? 0;
  const isPriceStale = priceData ? !priceData.isFresh : true;

  // Convert market to display format
  const selectedMarketDisplay = useMemo(() => {
    if (!selectedMarket || currentPrice <= 0) return null;
    return toMarketDisplay(selectedMarket, currentPrice);
  }, [selectedMarket, currentPrice]);

  // Select market handler
  const selectMarket = useCallback((marketId: string) => {
    setSelectedMarketId(marketId);
  }, []);

  // Combined loading and error states
  const isLoading = marketsLoading || marketLoading || priceLoading;
  const error = (marketsError || marketError) as Error | null;

  const value: PerpMarketContextValue = {
    selectedMarketId,
    selectedMarket: selectedMarket ?? null,
    selectedMarketDisplay,
    selectMarket,
    markets,
    marketsLoading,
    currentPrice,
    priceLoading,
    isPriceStale,
    isLoading,
    error,
  };

  return (
    <PerpMarketContext.Provider value={value}>
      {children}
    </PerpMarketContext.Provider>
  );
}

/**
 * Hook to access perp market context
 */
export function usePerpMarketContext() {
  const context = useContext(PerpMarketContext);
  if (!context) {
    throw new Error(
      'usePerpMarketContext must be used within a PerpMarketProvider',
    );
  }
  return context;
}

/**
 * Hook to get just the current price (convenience)
 */
export function useCurrentPrice() {
  const { currentPrice, priceLoading, isPriceStale } = usePerpMarketContext();
  return { currentPrice, priceLoading, isPriceStale };
}

/**
 * Hook to get the selected market (convenience)
 */
export function useSelectedMarket() {
  const {
    selectedMarket,
    selectedMarketDisplay,
    selectMarket,
    markets,
    marketsLoading,
  } = usePerpMarketContext();
  return {
    market: selectedMarket,
    marketDisplay: selectedMarketDisplay,
    selectMarket,
    markets,
    marketsLoading,
  };
}
