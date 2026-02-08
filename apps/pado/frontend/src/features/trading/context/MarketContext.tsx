/**
 * MarketContext
 * 현재 선택된 거래쌍(Pool)을 관리하는 Context
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { POOLS } from '../../../config/network';
import type { PoolConfig, TokenConfig } from '../types';

export type { PoolConfig, TokenConfig };

// 마켓 키 타입
export type MarketKey = keyof typeof POOLS;

// All defined markets (including undeployed)
const ALL_MARKETS: { key: MarketKey; label: string; pool: PoolConfig }[] = [
  {
    key: 'NBTC_NUSDC',
    label: 'NBTC/NUSDC',
    pool: POOLS.NBTC_NUSDC,
  },
  {
    key: 'NASUN_NUSDC',
    label: 'NASUN/NUSDC',
    pool: POOLS.NASUN_NUSDC,
  },
  {
    key: 'NETH_NUSDC',
    label: 'NETH/NUSDC',
    pool: POOLS.NETH_NUSDC,
  },
  {
    key: 'NSOL_NUSDC',
    label: 'NSOL/NUSDC',
    pool: POOLS.NSOL_NUSDC,
  },
];

// Only show markets with deployed pool IDs (env vars set)
export const MARKETS = ALL_MARKETS.filter(m => m.pool.id && m.pool.baseToken.type);

// Context 타입
interface MarketContextType {
  // 현재 선택된 마켓
  currentMarket: MarketKey;
  currentPool: PoolConfig;

  // 마켓 변경
  setMarket: (market: MarketKey) => void;

  // 마켓 목록
  markets: typeof MARKETS;

  // 헬퍼
  getMarketLabel: () => string;
  getBaseToken: () => TokenConfig;
  getQuoteToken: () => TokenConfig;
}

const MarketContext = createContext<MarketContextType | null>(null);

interface MarketProviderProps {
  children: ReactNode;
  defaultMarket?: MarketKey;
}

export function MarketProvider({ children, defaultMarket = 'NBTC_NUSDC' }: MarketProviderProps) {
  const [currentMarket, setCurrentMarket] = useState<MarketKey>(defaultMarket);

  const currentPool = POOLS[currentMarket];

  const setMarket = useCallback((market: MarketKey) => {
    setCurrentMarket(market);
  }, []);

  const getMarketLabel = useCallback(() => {
    const market = MARKETS.find(m => m.key === currentMarket);
    return market?.label ?? 'Unknown';
  }, [currentMarket]);

  const getBaseToken = useCallback(() => {
    return currentPool.baseToken;
  }, [currentPool]);

  const getQuoteToken = useCallback(() => {
    return currentPool.quoteToken;
  }, [currentPool]);

  return (
    <MarketContext.Provider
      value={{
        currentMarket,
        currentPool,
        setMarket,
        markets: MARKETS,
        getMarketLabel,
        getBaseToken,
        getQuoteToken,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarket must be used within a MarketProvider');
  }
  return context;
}
