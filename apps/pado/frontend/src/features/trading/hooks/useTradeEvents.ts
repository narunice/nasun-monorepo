/**
 * useTradeEvents Hook
 * Subscribe to DeepBook OrderFilled events via EventService
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getEventService } from '../../../lib/event-service';
import { useMarket } from '../context/MarketContext';
import type { Trade } from '../components/TradeHistory';
import type { ConnectionMode, DeepBookEvent, OrderFilledEvent } from '../types/events';

interface UseTradeEventsOptions {
  maxTrades?: number; // Maximum trades to keep (default 50)
  simulationEnabled?: boolean; // Enable simulation fallback (default true)
  simulationInterval?: number; // Simulation interval ms (default 3000)
}

interface UseTradeEventsResult {
  trades: Trade[];
  connectionMode: ConnectionMode;
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
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('simulation');
  const [realTradeCount, setRealTradeCount] = useState(0);
  const isConnectedRef = useRef(false);

  // Add trade helper
  const addTrade = useCallback(
    (trade: Trade, isReal: boolean) => {
      setTrades((prev) => [trade, ...prev.slice(0, maxTrades - 1)]);
      if (isReal) setRealTradeCount((c) => c + 1);
    },
    [maxTrades]
  );

  // Convert OrderFilledEvent to Trade
  const parseOrderFilledToTrade = useCallback(
    (event: OrderFilledEvent): Trade => {
      return {
        id: event.txDigest + event.orderId,
        price: Number(event.price) / Math.pow(10, currentPool.quoteToken.decimals),
        quantity: Number(event.quantity) / Math.pow(10, currentPool.baseToken.decimals),
        isBuy: event.takerIsBid,
        timestamp: event.timestamp,
        isSimulated: false,
      };
    },
    [currentPool]
  );

  // Connect to EventService and subscribe
  useEffect(() => {
    const eventService = getEventService();

    const connect = async () => {
      // Connect with pool filter
      const mode = await eventService.connect(currentPool?.id);
      setConnectionMode(mode);
      isConnectedRef.current = mode !== 'simulation';

      console.log(`[useTradeEvents] Connection mode: ${mode}`);
    };

    // Subscribe to OrderFilled events
    const unsubscribe = eventService.subscribe('OrderFilled', (event: DeepBookEvent) => {
      if (event.type === 'OrderFilled') {
        const trade = parseOrderFilledToTrade(event.data);
        addTrade(trade, true);
      }
    });

    connect();

    return () => {
      unsubscribe();
    };
  }, [currentPool, addTrade, parseOrderFilledToTrade]);

  // Simulation fallback (only when in simulation mode)
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
      // Only add simulated trades if not receiving real trades
      if (!isConnectedRef.current || connectionMode === 'simulation') {
        const trade = generateSimulatedTrade(currentPool.baseToken.symbol);
        addTrade(trade, false);
      }
    }, simulationInterval + Math.random() * 2000);

    return () => clearInterval(interval);
  }, [simulationEnabled, simulationInterval, currentPool, addTrade, connectionMode]);

  return {
    trades,
    connectionMode,
    realTradeCount,
    isSimulating: connectionMode === 'simulation' || (trades.length > 0 && realTradeCount === 0),
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
    isSimulated: true,
  };
}
