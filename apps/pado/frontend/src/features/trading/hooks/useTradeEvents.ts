/**
 * useTradeEvents Hook
 * Subscribe to DeepBook OrderFilled events with simulation fallback
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSuiClient } from '../../../lib/sui-client';
import { NETWORK_CONFIG } from '../../../config/network';
import { useMarket } from '../context/MarketContext';
import type { Trade } from '../components/TradeHistory';

interface UseTradeEventsOptions {
  maxTrades?: number; // Maximum trades to keep (default 50)
  simulationEnabled?: boolean; // Enable simulation (default true)
  simulationInterval?: number; // Simulation interval ms (default 3000)
}

interface UseTradeEventsResult {
  trades: Trade[];
  isSubscribed: boolean;
  realTradeCount: number;
  isSimulating: boolean;
}

export function useTradeEvents(
  options: UseTradeEventsOptions = {}
): UseTradeEventsResult {
  const {
    maxTrades = 50,
    simulationEnabled = true,
    simulationInterval = 3000,
  } = options;

  const { currentPool } = useMarket();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [realTradeCount, setRealTradeCount] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Add trade helper
  const addTrade = useCallback(
    (trade: Trade, isReal: boolean) => {
      setTrades((prev) => [trade, ...prev.slice(0, maxTrades - 1)]);
      if (isReal) setRealTradeCount((c) => c + 1);
    },
    [maxTrades]
  );

  // Subscribe to blockchain events
  useEffect(() => {
    const client = getSuiClient();

    const subscribe = async () => {
      try {
        const unsubscribe = await client.subscribeEvent({
          filter: {
            MoveEventType: `${NETWORK_CONFIG.deepbookPackage}::pool::OrderFilled`,
          },
          onMessage: (event) => {
            // Parse OrderFilled event
            const parsedJson = event.parsedJson as {
              price?: string;
              quantity?: string;
              base_quantity?: string;
              is_bid?: boolean;
              taker_is_bid?: boolean;
            };

            // Handle different field names in DeepBook events
            const price = parsedJson.price;
            const quantity = parsedJson.quantity || parsedJson.base_quantity;
            const isBid =
              parsedJson.is_bid !== undefined
                ? parsedJson.is_bid
                : parsedJson.taker_is_bid;

            if (!price || !quantity) {
              console.warn('Invalid OrderFilled event:', parsedJson);
              return;
            }

            const trade: Trade = {
              id: event.id.txDigest + event.id.eventSeq,
              price: Number(price) / Math.pow(10, currentPool.quoteToken.decimals),
              quantity: Number(quantity) / Math.pow(10, currentPool.baseToken.decimals),
              isBuy: isBid ?? Math.random() > 0.5,
              timestamp: Number(event.timestampMs),
            };

            addTrade(trade, true);
          },
        });

        unsubscribeRef.current = unsubscribe;
        setIsSubscribed(true);
        console.log('Subscribed to OrderFilled events');
      } catch (error) {
        console.warn('Event subscription failed, using simulation only:', error);
        setIsSubscribed(false);
      }
    };

    subscribe();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [currentPool, addTrade]);

  // Simulation fallback
  useEffect(() => {
    if (!simulationEnabled) return;

    // Generate initial trades
    const initialTrades = generateInitialTrades(
      currentPool.baseToken.symbol,
      20
    );
    setTrades(initialTrades);

    // Add new simulated trades periodically
    const interval = setInterval(() => {
      const trade = generateSimulatedTrade(currentPool.baseToken.symbol);
      addTrade(trade, false);
    }, simulationInterval + Math.random() * 2000);

    return () => clearInterval(interval);
  }, [simulationEnabled, simulationInterval, currentPool, addTrade]);

  return {
    trades,
    isSubscribed,
    realTradeCount,
    isSimulating: trades.length > 0 && realTradeCount === 0,
  };
}

// Generate initial simulated trades
function generateInitialTrades(baseSymbol: string, count: number): Trade[] {
  const trades: Trade[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const trade = generateSimulatedTrade(baseSymbol);
    trade.timestamp = now - i * (1000 + Math.random() * 5000);
    trade.id = `sim-init-${i}-${Math.random().toString(36).slice(2)}`;
    trades.push(trade);
  }

  return trades;
}

// Generate a single simulated trade
function generateSimulatedTrade(baseSymbol: string): Trade {
  const basePrice = baseSymbol === 'NBTC' ? 95000 : 0.1;
  const volatility = 0.005;
  const priceChange = (Math.random() - 0.5) * 2 * volatility * basePrice;

  return {
    id: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    price: basePrice + priceChange,
    quantity: 0.001 + Math.random() * 0.1,
    isBuy: Math.random() > 0.5,
    timestamp: Date.now(),
  };
}
