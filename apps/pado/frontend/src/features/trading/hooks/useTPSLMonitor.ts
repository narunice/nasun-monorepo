/**
 * useTPSLMonitor Hook
 *
 * Monitors oracle price and triggers TP/SL market orders when conditions are met.
 * Supports two execution modes:
 * - Client-side (browser): requires tab open, uses localStorage + client polling
 * - Server-side (keeper): delegates TradeCap, keeper bot executes via REST API
 *
 * Safety features:
 * - Oracle freshness check (won't trigger on stale/simulated prices)
 * - Cross-tab claim lock via localStorage 'executing' status
 * - Ref-based executeMarketOrder to prevent interval teardown on re-renders
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPriceWithFreshness, type TokenSymbol } from '../../../lib/prices';
import { playSound } from '../../../lib/sounds';
import { sendBrowserNotification } from '../../../lib/browser-notify';
import { useToast } from '@/components/common';
import type { TPSLOrder } from '../lib/tpsl-types';
import { shouldTrigger, TPSL_POLL_INTERVAL_MS } from '../lib/tpsl-types';
import {
  getActiveTPSLOrders,
  updateTPSLStatus,
  claimTPSLOrder,
  addTPSLOrder,
  cancelTPSLOrder as cancelTPSLOrderLocal,
  removeTPSLOrder,
  getTPSLOrders,
  clearTPSLHistory,
  pruneTPSLHistory,
} from '../lib/tpsl-storage';
import {
  registerTPSLOrder,
  getUserTPSLOrders,
  cancelTPSLOrder as cancelTPSLOrderKeeper,
  isKeeperConfigured,
} from '../lib/tpsl-api';
import type { TradeCapStatus } from './useTradeCap';

export interface UseTPSLMonitorResult {
  orders: TPSLOrder[];
  activeOrders: TPSLOrder[];
  addOrder: (order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>) => TPSLOrder | null;
  addOrderAsync: (order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>) => Promise<TPSLOrder | null>;
  cancelOrder: (id: string) => void;
  removeOrder: (id: string) => void;
  clearHistory: () => void;
  isMonitoring: boolean;
  executionMode: 'client' | 'server';
}

type ExecuteMarketOrderFn = (
  side: 'buy' | 'sell',
  quantity: number
) => Promise<{ success: boolean; error?: string; digest?: string }>;

type ExecuteLimitOrderFn = (
  side: 'buy' | 'sell',
  quantity: number,
  limitPrice: number
) => Promise<{ success: boolean; error?: string; digest?: string }>;

interface UseTPSLMonitorParams {
  executeMarketOrder: ExecuteMarketOrderFn;
  /** Execute limit order for stop-limit triggers */
  executeLimitOrder?: ExecuteLimitOrderFn;
  hasBalanceManager: boolean;
  /** Current market base symbol for price monitoring */
  marketSymbol?: TokenSymbol;
  /** Current pool ID for keeper registration */
  poolId?: string;
  /** Wallet address for keeper order queries */
  walletAddress?: string;
  /** BalanceManager ID for keeper registration */
  balanceManagerId?: string | null;
  /** TradeCap delegation status */
  tradeCapStatus?: TradeCapStatus;
  /** Delegated TradeCap object ID */
  tradeCapId?: string | null;
}

export function useTPSLMonitor({
  executeMarketOrder,
  executeLimitOrder,
  hasBalanceManager,
  marketSymbol,
  poolId,
  walletAddress,
  balanceManagerId,
  tradeCapStatus,
  tradeCapId,
}: UseTPSLMonitorParams): UseTPSLMonitorResult {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<TPSLOrder[]>(() => getTPSLOrders());

  const isDelegated = tradeCapStatus === 'delegated' && isKeeperConfigured();
  const executionMode = isDelegated ? 'server' : 'client';

  // Stable ref for executeMarketOrder to prevent interval restarts
  const executeRef = useRef<ExecuteMarketOrderFn>(executeMarketOrder);
  useEffect(() => { executeRef.current = executeMarketOrder; }, [executeMarketOrder]);

  // Stable ref for executeLimitOrder (stop-limit orders)
  const executeLimitRef = useRef<ExecuteLimitOrderFn | undefined>(executeLimitOrder);
  useEffect(() => { executeLimitRef.current = executeLimitOrder; }, [executeLimitOrder]);

  const hasBalanceManagerRef = useRef(hasBalanceManager);
  useEffect(() => { hasBalanceManagerRef.current = hasBalanceManager; }, [hasBalanceManager]);

  const marketSymbolRef = useRef(marketSymbol);
  useEffect(() => { marketSymbolRef.current = marketSymbol; }, [marketSymbol]);

  // Prune old history on mount
  useEffect(() => { pruneTPSLHistory(); }, []);

  const refreshOrders = useCallback(() => {
    setOrders(getTPSLOrders());
  }, []);

  // Fetch keeper orders when delegated
  const { data: keeperOrders } = useQuery({
    queryKey: ['keeperTPSLOrders', walletAddress],
    queryFn: () => getUserTPSLOrders(walletAddress!),
    enabled: isDelegated && !!walletAddress,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Core trigger check - client-side only (skipped when delegated)
  const checkTriggers = useCallback(async () => {
    // Skip client-side monitoring when keeper is handling orders
    if (isDelegated) return;
    if (!hasBalanceManagerRef.current) return;

    const activeOrders = getActiveTPSLOrders();
    if (activeOrders.length === 0) return;

    // Only trigger on fresh oracle data, never on simulated fallback
    const symbol = marketSymbolRef.current;
    if (!symbol) return;
    const priceInfo = getPriceWithFreshness(symbol);
    if (!priceInfo.isFresh || priceInfo.source !== 'oracle') return;

    const currentPrice = priceInfo.price;
    if (currentPrice <= 0) return;

    const baseSymbol = marketSymbolRef.current;

    // Sequential execution to avoid nonce conflicts with Sui transaction signing
    for (const order of activeOrders) {
      if (!shouldTrigger(order, currentPrice)) continue;

      // Cross-tab safety: claim order via localStorage before executing
      if (!claimTPSLOrder(order.id)) continue;

      const typeLabel = order.triggerType === 'tp'
        ? 'Take Profit'
        : order.triggerType === 'stop-limit'
          ? 'Stop-Limit'
          : 'Stop Loss';
      const priceStr = currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });

      playSound('tpslTriggered');
      showToast(
        `${typeLabel} triggered at $${priceStr} — ${order.triggerType === 'stop-limit' ? 'placing limit order' : 'executing'} ${order.side} ${order.quantity} ${baseSymbol}...`,
        'info'
      );

      try {
        // Stop-limit: place limit order at the specified limitPrice
        // TP/SL: execute market order immediately
        let result: { success: boolean; error?: string; digest?: string };
        if (order.triggerType === 'stop-limit') {
          if (!order.limitPrice || !executeLimitRef.current) {
            result = { success: false, error: 'Limit order function unavailable' };
          } else {
            result = await executeLimitRef.current(order.side, order.quantity, order.limitPrice);
          }
        } else {
          result = await executeRef.current(order.side, order.quantity);
        }

        if (result.success) {
          updateTPSLStatus(order.id, 'triggered', {
            triggeredAt: Date.now(),
            digest: result.digest,
          });
          const successMsg = `${typeLabel} executed: ${order.side === 'buy' ? 'Bought' : 'Sold'} ${order.quantity} ${baseSymbol}`;
          showToast(successMsg, 'success');
          sendBrowserNotification('TP/SL Triggered', {
            body: successMsg,
            tag: `tpsl-${order.id}`,
          });
        } else {
          updateTPSLStatus(order.id, 'failed', {
            triggeredAt: Date.now(),
            error: result.error,
          });
          playSound('error');
          const failMsg = `${typeLabel} failed: ${result.error || 'Unknown error'}`;
          showToast(failMsg, 'error');
          sendBrowserNotification('TP/SL Failed', {
            body: `${typeLabel} execution failed. Check the app for details.`,
            tag: `tpsl-${order.id}`,
          });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        updateTPSLStatus(order.id, 'failed', {
          triggeredAt: Date.now(),
          error: errorMsg,
        });
        playSound('error');
        showToast(`${typeLabel} failed: ${errorMsg}`, 'error');
      } finally {
        refreshOrders();
      }
    }
  }, [showToast, refreshOrders, isDelegated]); // No executeMarketOrder or hasBalanceManager — uses refs

  // Stable interval that never restarts
  useEffect(() => {
    if (isDelegated) return; // Keeper handles monitoring
    const timer = window.setInterval(checkTriggers, TPSL_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkTriggers, isDelegated]);

  // Client-side addOrder (synchronous, localStorage)
  const addOrder = useCallback(
    (order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>) => {
      const result = addTPSLOrder(order);
      if (result) {
        refreshOrders();
        const typeLabel = result.triggerType === 'tp'
          ? 'Take Profit'
          : result.triggerType === 'stop-limit'
            ? 'Stop-Limit'
            : 'Stop Loss';
        const priceStr = result.triggerPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });
        const limitInfo = result.triggerType === 'stop-limit' && result.limitPrice
          ? ` → limit $${result.limitPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
          : '';
        showToast(`${typeLabel} set at $${priceStr}${limitInfo}`, 'success');
      } else {
        showToast('Invalid order or max limit reached (50)', 'warning');
      }
      return result;
    },
    [refreshOrders, showToast]
  );

  // Async addOrder that routes to keeper API when delegated
  const addOrderAsync = useCallback(
    async (order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>): Promise<TPSLOrder | null> => {
      // Stop-limit always uses client-side (keeper API doesn't support stop_limit type)
      if (!isDelegated || !walletAddress || !balanceManagerId || !tradeCapId || !poolId || !marketSymbol || order.triggerType === 'stop-limit') {
        return addOrder(order);
      }

      try {
        const response = await registerTPSLOrder({
          userAddress: walletAddress,
          poolId,
          marketSymbol,
          side: order.side,
          triggerType: order.triggerType === 'tp' ? 'take_profit' : 'stop_loss',
          triggerPrice: order.triggerPrice,
          quantity: order.quantity,
          tradeCapId,
          balanceManagerId,
        });

        // Also store locally for immediate UI update
        const localOrder: TPSLOrder = {
          id: response.id,
          side: order.side,
          quantity: order.quantity,
          triggerPrice: order.triggerPrice,
          triggerType: order.triggerType,
          status: 'active',
          createdAt: response.createdAt,
        };

        const typeLabel = order.triggerType === 'tp' ? 'Take Profit' : 'Stop Loss';
        const priceStr = order.triggerPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });
        showToast(`${typeLabel} set at $${priceStr} (server-side)`, 'success');

        // Refresh keeper orders
        queryClient.invalidateQueries({ queryKey: ['keeperTPSLOrders'] });

        return localOrder;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        showToast(`Failed to register TP/SL: ${errorMsg}`, 'error');
        return null;
      }
    },
    [isDelegated, walletAddress, balanceManagerId, tradeCapId, poolId, marketSymbol, addOrder, showToast, queryClient]
  );

  const handleCancelOrder = useCallback(
    async (id: string) => {
      if (isDelegated) {
        try {
          await cancelTPSLOrderKeeper(id, walletAddress);
          showToast('TP/SL order cancelled (server)', 'info');
          queryClient.invalidateQueries({ queryKey: ['keeperTPSLOrders'] });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          showToast(`Cancel failed: ${errorMsg}`, 'error');
        }
      } else {
        cancelTPSLOrderLocal(id);
        refreshOrders();
        showToast('TP/SL order cancelled', 'info');
      }
    },
    [isDelegated, walletAddress, refreshOrders, showToast, queryClient]
  );

  const handleRemoveOrder = useCallback(
    (id: string) => {
      removeTPSLOrder(id);
      refreshOrders();
    },
    [refreshOrders]
  );

  const handleClearHistory = useCallback(() => {
    clearTPSLHistory();
    refreshOrders();
  }, [refreshOrders]);

  // Merge local orders with keeper orders for display
  const displayOrders = isDelegated && keeperOrders
    ? keeperOrders.map((ko): TPSLOrder => ({
        id: ko.id,
        side: ko.side,
        quantity: ko.quantity,
        triggerPrice: ko.triggerPrice,
        triggerType: ko.triggerType === 'take_profit' ? 'tp' : 'sl',
        status: ko.status === 'active' ? 'active'
          : ko.status === 'executing' ? 'executing'
          : ko.status === 'filled' ? 'triggered'
          : ko.status === 'canceled' ? 'cancelled'
          : 'failed',
        createdAt: ko.createdAt,
        digest: ko.txDigest,
        error: ko.error,
      }))
    : orders;

  const activeOrders = displayOrders.filter((o) => o.status === 'active');
  const isMonitoring = activeOrders.length > 0 && hasBalanceManager;

  return {
    orders: displayOrders,
    activeOrders,
    addOrder,
    addOrderAsync,
    cancelOrder: handleCancelOrder,
    removeOrder: handleRemoveOrder,
    clearHistory: handleClearHistory,
    isMonitoring,
    executionMode,
  };
}
