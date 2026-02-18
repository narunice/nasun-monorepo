/**
 * Perp Oracle Price Hook (re-export adapter)
 *
 * Delegates to the unified Oracle hooks in features/core/usePrices.
 * Keeps perp-specific convenience wrappers (useBtcPrice, etc.) that
 * flatten the TanStack Query result for simpler consumption.
 *
 * @module features/perp/hooks/useOraclePrice
 */

export {
  useOraclePrice,
  useIsOracleStale,
  formatOraclePrice as formatPrice,
  type OraclePriceData,
} from '../../core/usePrices';

import { useOraclePrice } from '../../core/usePrices';
import { ORACLE_SYMBOL } from '../constants';

// ========================================
// Convenience Hooks (flat return shape)
// ========================================

interface SymbolPriceResult {
  price: number;
  timestamp: number;
  isFresh: boolean;
  isLoading: boolean;
  error: Error | null;
}

function useSymbolPrice(symbolId: number): SymbolPriceResult {
  const { data, isLoading, error } = useOraclePrice(symbolId);
  return {
    price: data?.price ?? 0,
    timestamp: data?.timestamp ?? 0,
    isFresh: data?.isFresh ?? false,
    isLoading,
    error: error as Error | null,
  };
}

export function useBtcPrice(): SymbolPriceResult {
  return useSymbolPrice(ORACLE_SYMBOL.BTC);
}

export function useEthPrice(): SymbolPriceResult {
  return useSymbolPrice(ORACLE_SYMBOL.ETH);
}

export function useNasunPrice(): SymbolPriceResult {
  return useSymbolPrice(ORACLE_SYMBOL.NSN);
}

export function useMarketPrice(baseSymbol: number): SymbolPriceResult {
  return useSymbolPrice(baseSymbol);
}
