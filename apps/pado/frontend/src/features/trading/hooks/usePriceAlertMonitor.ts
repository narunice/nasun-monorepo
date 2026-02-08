/**
 * usePriceAlertMonitor Hook
 *
 * Monitors oracle price and fires notifications when price alerts trigger.
 * Unlike TP/SL, this hook does NOT execute orders — only sends alerts.
 *
 * Uses the same oracle freshness check and polling pattern as useTPSLMonitor.
 */

import { useEffect, useCallback, useState } from 'react';
import { getPriceWithFreshness, type TokenSymbol } from '../../../lib/prices';
import { playSound } from '../../../lib/sounds';
import { sendBrowserNotification } from '../../../lib/browser-notify';
import { getNotificationPrefs } from '../../../lib/notification-preferences';
import { useToast } from '@/components/common';
import type { PriceAlert } from '../lib/price-alert-types';
import {
  shouldTriggerAlert,
  PRICE_ALERT_POLL_INTERVAL_MS,
} from '../lib/price-alert-types';
import {
  getActivePriceAlerts,
  updatePriceAlertStatus,
  addPriceAlert,
  cancelPriceAlert,
  removePriceAlert,
  getPriceAlerts,
  clearPriceAlertHistory,
  prunePriceAlertHistory,
} from '../lib/price-alert-storage';

export interface UsePriceAlertMonitorResult {
  alerts: PriceAlert[];
  activeAlerts: PriceAlert[];
  addAlert: (alert: Omit<PriceAlert, 'id' | 'status' | 'createdAt'>) => PriceAlert | null;
  cancelAlert: (id: string) => void;
  removeAlert: (id: string) => void;
  clearHistory: () => void;
}

export function usePriceAlertMonitor(): UsePriceAlertMonitorResult {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => getPriceAlerts());

  // Prune old history on mount
  useEffect(() => { prunePriceAlertHistory(); }, []);

  const refreshAlerts = useCallback(() => {
    setAlerts(getPriceAlerts());
  }, []);

  // Core trigger check
  const checkTriggers = useCallback(() => {
    const prefs = getNotificationPrefs();
    if (!prefs.priceAlertEnabled) return;

    const activeAlerts = getActivePriceAlerts();
    if (activeAlerts.length === 0) return;

    // Group alerts by symbol to fetch each price once
    const bySymbol = new Map<string, PriceAlert[]>();
    for (const alert of activeAlerts) {
      const group = bySymbol.get(alert.symbol) ?? [];
      group.push(alert);
      bySymbol.set(alert.symbol, group);
    }

    let triggered = false;

    for (const [symbol, symbolAlerts] of bySymbol) {
      // Only trigger on fresh oracle data per symbol
      const priceInfo = getPriceWithFreshness(symbol as TokenSymbol);
      if (!priceInfo.isFresh || priceInfo.source !== 'oracle') continue;

      const currentPrice = priceInfo.price;
      if (currentPrice <= 0) continue;

    for (const alert of symbolAlerts) {
      if (!shouldTriggerAlert(alert, currentPrice)) continue;

      updatePriceAlertStatus(alert.id, 'triggered', {
        triggeredAt: Date.now(),
      });

      const dirLabel = alert.direction === 'above' ? 'above' : 'below';
      const priceStr = currentPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const targetStr = alert.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const body = `${alert.symbol} reached $${priceStr} (${dirLabel} $${targetStr})`;

      playSound('priceAlert');
      showToast(body, 'info');
      sendBrowserNotification('Price Alert', {
        body,
        tag: `price-alert-${alert.id}`,
      });

      triggered = true;
    }
    } // end bySymbol loop

    if (triggered) refreshAlerts();
  }, [showToast, refreshAlerts]);

  // Polling interval
  useEffect(() => {
    const timer = window.setInterval(checkTriggers, PRICE_ALERT_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkTriggers]);

  const handleAddAlert = useCallback(
    (alert: Omit<PriceAlert, 'id' | 'status' | 'createdAt'>) => {
      const result = addPriceAlert(alert);
      if (result) {
        refreshAlerts();
        const dirLabel = result.direction === 'above' ? 'above' : 'below';
        const priceStr = result.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 2 });
        showToast(`Alert set: ${result.symbol} ${dirLabel} $${priceStr}`, 'success');
      } else {
        showToast('Invalid alert or max limit reached (20)', 'warning');
      }
      return result;
    },
    [refreshAlerts, showToast]
  );

  const handleCancelAlert = useCallback(
    (id: string) => {
      cancelPriceAlert(id);
      refreshAlerts();
      showToast('Price alert cancelled', 'info');
    },
    [refreshAlerts, showToast]
  );

  const handleRemoveAlert = useCallback(
    (id: string) => {
      removePriceAlert(id);
      refreshAlerts();
    },
    [refreshAlerts]
  );

  const handleClearHistory = useCallback(() => {
    clearPriceAlertHistory();
    refreshAlerts();
  }, [refreshAlerts]);

  const activeAlerts = alerts.filter((a) => a.status === 'active');

  return {
    alerts,
    activeAlerts,
    addAlert: handleAddAlert,
    cancelAlert: handleCancelAlert,
    removeAlert: handleRemoveAlert,
    clearHistory: handleClearHistory,
  };
}
