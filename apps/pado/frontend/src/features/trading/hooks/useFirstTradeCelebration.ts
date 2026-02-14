/**
 * useFirstTradeCelebration
 *
 * Triggers a one-time celebration modal on the user's very first order fill.
 * Listens for the `pado:order-filled` custom event (dispatched by useOrderFillNotifier)
 * and tracks completion via localStorage.
 *
 * NOTE: This is a client-side-only flag. Do not rely on it for server-side
 * logic (rewards, eligibility). Validate on-chain trade history instead.
 */

import { useEffect, useState, useCallback } from 'react';
import { ORDER_FILL_EVENT } from './useOrderFillNotifier';

export const FIRST_TRADE_STORAGE_KEY = 'pado:firstTradeCelebrated';

function getStorageItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function setStorageItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}

export function useFirstTradeCelebration() {
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    // Already celebrated — skip listener entirely
    if (getStorageItem(FIRST_TRADE_STORAGE_KEY)) return;

    const handler = () => {
      // Double-check in case another tab celebrated
      if (getStorageItem(FIRST_TRADE_STORAGE_KEY)) return;
      setStorageItem(FIRST_TRADE_STORAGE_KEY, String(Date.now()));
      setShowCelebration(true);
    };

    document.addEventListener(ORDER_FILL_EVENT, handler);
    return () => document.removeEventListener(ORDER_FILL_EVENT, handler);
  }, []);

  const dismiss = useCallback(() => setShowCelebration(false), []);

  return { showCelebration, dismiss };
}
