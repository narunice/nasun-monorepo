/**
 * useTradeMode Hook
 * Manages Simple/Pro trading mode preference with localStorage persistence
 */

import { useState, useCallback, useEffect } from 'react';

export type TradeMode = 'simple' | 'pro';

const STORAGE_KEY = 'pado_trade_mode';

export function useTradeMode() {
  const [mode, setModeState] = useState<TradeMode>(() => {
    if (typeof window === 'undefined') return 'simple';
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'pro' || stored === 'simple') ? stored : 'pro';
  });

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const setMode = useCallback((newMode: TradeMode) => {
    setModeState(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === 'simple' ? 'pro' : 'simple'));
  }, []);

  const isSimple = mode === 'simple';
  const isPro = mode === 'pro';

  return {
    mode,
    setMode,
    toggleMode,
    isSimple,
    isPro,
  };
}
