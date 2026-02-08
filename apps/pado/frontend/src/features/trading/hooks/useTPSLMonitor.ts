/**
 * useTPSLMonitor Hook
 *
 * Monitors oracle price and triggers TP/SL market orders when conditions are met.
 * Requires browser tab to be open (client-side polling).
 *
 * Safety features:
 * - Oracle freshness check (won't trigger on stale/simulated prices)
 * - Cross-tab claim lock via localStorage 'executing' status
 * - Ref-based executeMarketOrder to prevent interval teardown on re-renders
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { getPriceWithFreshness } from '../../../lib/prices';
import { useToast } from '@/components/common';
import type { TPSLOrder } from '../lib/tpsl-types';
import { shouldTrigger, TPSL_POLL_INTERVAL_MS } from '../lib/tpsl-types';
import {
  getActiveTPSLOrders,
  updateTPSLStatus,
  claimTPSLOrder,
  addTPSLOrder,
  cancelTPSLOrder,
  removeTPSLOrder,
  getTPSLOrders,
  clearTPSLHistory,
  pruneTPSLHistory,
} from '../lib/tpsl-storage';

export interface UseTPSLMonitorResult {
  orders: TPSLOrder[];
  activeOrders: TPSLOrder[];
  addOrder: (order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>) => TPSLOrder | null;
  cancelOrder: (id: string) => void;
  removeOrder: (id: string) => void;
  clearHistory: () => void;
  isMonitoring: boolean;
}

type ExecuteMarketOrderFn = (
  side: 'buy' | 'sell',
  quantity: number
) => Promise<{ success: boolean; error?: string; digest?: string }>;

interface UseTPSLMonitorParams {
  executeMarketOrder: ExecuteMarketOrderFn;
  hasBalanceManager: boolean;
}

export function useTPSLMonitor({
  executeMarketOrder,
  hasBalanceManager,
}: UseTPSLMonitorParams): UseTPSLMonitorResult {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<TPSLOrder[]>(() => getTPSLOrders());

  // Stable ref for executeMarketOrder to prevent interval restarts
  const executeRef = useRef<ExecuteMarketOrderFn>(executeMarketOrder);
  useEffect(() => { executeRef.current = executeMarketOrder; }, [executeMarketOrder]);

  const hasBalanceManagerRef = useRef(hasBalanceManager);
  useEffect(() => { hasBalanceManagerRef.current = hasBalanceManager; }, [hasBalanceManager]);

  // Prune old history on mount
  useEffect(() => { pruneTPSLHistory(); }, []);

  const refreshOrders = useCallback(() => {
    setOrders(getTPSLOrders());
  }, []);

  // Core trigger check - uses refs so it never changes identity
  const checkTriggers = useCallback(async () => {
    if (!hasBalanceManagerRef.current) return;

    const activeOrders = getActiveTPSLOrders();
    if (activeOrders.length === 0) return;

    // Only trigger on fresh oracle data, never on simulated fallback
    const priceInfo = getPriceWithFreshness('NBTC');
    if (!priceInfo.isFresh || priceInfo.source !== 'oracle') return;

    const currentPrice = priceInfo.price;
    if (currentPrice <= 0) return;

    // Sequential execution to avoid nonce conflicts with Sui transaction signing
    for (const order of activeOrders) {
      if (!shouldTrigger(order, currentPrice)) continue;

      // Cross-tab safety: claim order via localStorage before executing
      if (!claimTPSLOrder(order.id)) continue;

      const typeLabel = order.triggerType === 'tp' ? 'Take Profit' : 'Stop Loss';
      const priceStr = currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });

      showToast(
        `${typeLabel} triggered at $${priceStr} — executing ${order.side} ${order.quantity} BTC...`,
        'info'
      );

      try {
        const result = await executeRef.current(order.side, order.quantity);

        if (result.success) {
          updateTPSLStatus(order.id, 'triggered', {
            triggeredAt: Date.now(),
            digest: result.digest,
          });
          showToast(
            `${typeLabel} executed: ${order.side === 'buy' ? 'Bought' : 'Sold'} ${order.quantity} BTC`,
            'success'
          );
        } else {
          updateTPSLStatus(order.id, 'failed', {
            triggeredAt: Date.now(),
            error: result.error,
          });
          showToast(`${typeLabel} failed: ${result.error || 'Unknown error'}`, 'error');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        updateTPSLStatus(order.id, 'failed', {
          triggeredAt: Date.now(),
          error: errorMsg,
        });
        showToast(`${typeLabel} failed: ${errorMsg}`, 'error');
      } finally {
        refreshOrders();
      }
    }
  }, [showToast, refreshOrders]); // No executeMarketOrder or hasBalanceManager — uses refs

  // Stable interval that never restarts
  useEffect(() => {
    const timer = window.setInterval(checkTriggers, TPSL_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkTriggers]);

  const addOrder = useCallback(
    (order: Omit<TPSLOrder, 'id' | 'status' | 'createdAt'>) => {
      const result = addTPSLOrder(order);
      if (result) {
        refreshOrders();
        const typeLabel = result.triggerType === 'tp' ? 'Take Profit' : 'Stop Loss';
        const priceStr = result.triggerPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });
        showToast(`${typeLabel} set at $${priceStr}`, 'success');
      } else {
        showToast('Invalid TP/SL order or max limit reached (50)', 'warning');
      }
      return result;
    },
    [refreshOrders, showToast]
  );

  const handleCancelOrder = useCallback(
    (id: string) => {
      cancelTPSLOrder(id);
      refreshOrders();
      showToast('TP/SL order cancelled', 'info');
    },
    [refreshOrders, showToast]
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

  const activeOrders = orders.filter((o) => o.status === 'active');
  const isMonitoring = activeOrders.length > 0 && hasBalanceManager;

  return {
    orders,
    activeOrders,
    addOrder,
    cancelOrder: handleCancelOrder,
    removeOrder: handleRemoveOrder,
    clearHistory: handleClearHistory,
    isMonitoring,
  };
}
