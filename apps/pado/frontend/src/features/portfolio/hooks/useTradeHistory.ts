/**
 * useTradeHistory Hook
 * Fetch user's trading history and calculate statistics
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWallet, useZkLogin } from '@nasun/wallet';

export interface UserTrade {
  id: string;
  poolId: string;
  poolName: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  total: number;
  fee: number;
  timestamp: number;
  txDigest: string;
}

export interface TradeStats {
  totalTrades: number;
  totalVolume: number;
  buyTrades: number;
  sellTrades: number;
  buyVolume: number;
  sellVolume: number;
  avgTradeSize: number;
  lastTradeTime: number | null;
}

interface UseTradeHistoryResult {
  trades: UserTrade[];
  stats: TradeStats;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const EMPTY_STATS: TradeStats = {
  totalTrades: 0,
  totalVolume: 0,
  buyTrades: 0,
  sellTrades: 0,
  buyVolume: 0,
  sellVolume: 0,
  avgTradeSize: 0,
  lastTradeTime: null,
};

export function useTradeHistory(): UseTradeHistoryResult {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const [trades, setTrades] = useState<UserTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine active address (zkLogin takes priority)
  const address = isZkConnected
    ? zkState?.address
    : status === 'unlocked'
      ? account?.address
      : undefined;
  const isConnected = (status === 'unlocked' && account) || isZkConnected;

  // Clear trades immediately when address changes (prevents stale data)
  useEffect(() => {
    setTrades([]);
    setError(null);
  }, [address]);

  // Fetch trades from blockchain (simulated for now)
  const fetchTrades = useCallback(async () => {
    if (!isConnected || !address) {
      setTrades([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // TODO: Replace with actual blockchain query
      // For now, generate simulated trade history based on account address
      const simulatedTrades = generateSimulatedTrades(address);

      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      setTrades(simulatedTrades);
    } catch (err) {
      console.error('Failed to fetch trade history:', err);
      setError('Failed to load trade history');
      setTrades([]);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // Calculate statistics from trades
  const stats = useMemo<TradeStats>(() => {
    if (trades.length === 0) return EMPTY_STATS;

    const buyTrades = trades.filter((t) => t.side === 'buy');
    const sellTrades = trades.filter((t) => t.side === 'sell');
    const buyVolume = buyTrades.reduce((sum, t) => sum + t.total, 0);
    const sellVolume = sellTrades.reduce((sum, t) => sum + t.total, 0);
    const totalVolume = buyVolume + sellVolume;

    return {
      totalTrades: trades.length,
      totalVolume,
      buyTrades: buyTrades.length,
      sellTrades: sellTrades.length,
      buyVolume,
      sellVolume,
      avgTradeSize: totalVolume / trades.length,
      lastTradeTime: Math.max(...trades.map((t) => t.timestamp)),
    };
  }, [trades]);

  return {
    trades,
    stats,
    isLoading,
    error,
    refetch: fetchTrades,
  };
}

// Generate simulated trades for demo purposes
// Will be replaced with actual blockchain data
function generateSimulatedTrades(accountAddress: string): UserTrade[] {
  // Use account address to generate consistent but random-looking data
  const seed = accountAddress.slice(2, 10);
  const seedNum = parseInt(seed, 16) || 12345;

  const pools = [
    { id: 'pool-nbtc-nusdc', name: 'NBTC/NUSDC', basePrice: 95000 },
    { id: 'pool-nasun-nusdc', name: 'NASUN/NUSDC', basePrice: 0.1 },
  ];

  const trades: UserTrade[] = [];
  const now = Date.now();
  const tradeCount = 30 + (seedNum % 20); // 30-49 trades for pagination testing

  for (let i = 0; i < tradeCount; i++) {
    const pool = pools[i % 2];
    const isBuy = (seedNum + i) % 3 !== 0; // ~66% buys
    const priceVariation = 1 + ((((seedNum * (i + 1)) % 100) - 50) / 10000);
    const price = pool.basePrice * priceVariation;
    const quantity = 0.001 + ((seedNum * (i + 2)) % 1000) / 10000;
    const total = price * quantity;
    const fee = total * 0.001;

    trades.push({
      id: `trade-${i}-${seed}`,
      poolId: pool.id,
      poolName: pool.name,
      side: isBuy ? 'buy' : 'sell',
      price,
      quantity,
      total,
      fee,
      timestamp: now - (i * 3600000) - ((seedNum * i) % 3600000), // Past hours
      txDigest: `0x${seed}${i.toString(16).padStart(8, '0')}...`,
    });
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
}
