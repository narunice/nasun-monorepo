/**
 * useTradeEvents Hook
 * Subscribe to DeepBook OrderFilled events via EventService
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getEventService } from '../../../lib/event-service';
import { useMarket } from '../context/MarketContext';
import { useToast } from '@/components/common';
import type { Trade } from '../types/trade';
import type { ConnectionMode, DeepBookEvent, OrderFilledEvent } from '../types/events';

interface UseTradeEventsOptions {
  maxTrades?: number; // Maximum trades to keep (default 50)
}

interface UseTradeEventsResult {
  trades: Trade[];
  connectionMode: ConnectionMode;
  realTradeCount: number;
}

export function useTradeEvents(
  options: UseTradeEventsOptions = {}
): UseTradeEventsResult {
  const { maxTrades = 50 } = options;

  const { currentPool } = useMarket();
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  useEffect(() => { showToastRef.current = showToast; });
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('polling');
  const [realTradeCount, setRealTradeCount] = useState(0);

  // Add trade helper
  const addTrade = useCallback(
    (trade: Trade) => {
      setTrades((prev) => [trade, ...prev.slice(0, maxTrades - 1)]);
      setRealTradeCount((c) => c + 1);
    },
    [maxTrades]
  );

  // Convert OrderFilledEvent to Trade
  const parseOrderFilledToTrade = useCallback(
    (event: OrderFilledEvent): Trade => {
      return {
        id: event.txDigest + event.makerOrderId,
        price: Number(event.price) / Math.pow(10, currentPool.quoteToken.decimals),
        quantity: Number(event.quantity) / Math.pow(10, currentPool.baseToken.decimals),
        isBuy: event.takerIsBid,
        timestamp: event.timestamp,
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
      // If simulation mode returned, treat as polling (no simulation data)
      const actualMode = mode === 'simulation' ? 'polling' : mode;
      setConnectionMode(actualMode);
    };

    // Subscribe to OrderFilled events
    const unsubscribe = eventService.subscribe('OrderFilled', (event: DeepBookEvent) => {
      if (event.type === 'OrderFilled') {
        const trade = parseOrderFilledToTrade(event.data);
        addTrade(trade);
      }
    });

    // Listen for mode degradation (e.g. websocket → polling → simulation)
    const unsubscribeMode = eventService.onModeChange((newMode, oldMode) => {
      const actualMode = newMode === 'simulation' ? 'polling' : newMode;
      setConnectionMode(actualMode);
      // Notify user when feed degrades from realtime to simulation
      if (newMode === 'simulation' && oldMode !== 'simulation') {
        showToastRef.current('Live feed interrupted. Market data may be delayed.', 'warning');
      }
    });

    connect();

    return () => {
      unsubscribe();
      unsubscribeMode();
    };
  }, [currentPool, addTrade, parseOrderFilledToTrade]);

  return {
    trades,
    connectionMode,
    realTradeCount,
  };
}
