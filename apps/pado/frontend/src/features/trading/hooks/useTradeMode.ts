/**
 * useTradeMode Hook
 * Manages Simple/Pro trading mode preference with Zustand store + localStorage persistence.
 * Global store so Header and TradePage share the same reactive state.
 */

import { create } from 'zustand';

export type TradeMode = 'simple' | 'pro';

const STORAGE_KEY = 'pado_trade_mode';

function readStoredMode(): TradeMode {
  if (typeof window === 'undefined') return 'simple';
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored === 'pro' || stored === 'simple') ? stored : 'pro';
}

interface TradeModeState {
  mode: TradeMode;
  isSimple: boolean;
  isPro: boolean;
  setMode: (mode: TradeMode) => void;
  toggleMode: () => void;
}

const useTradeModeStore = create<TradeModeState>((set) => {
  const initial = readStoredMode();
  return {
    mode: initial,
    isSimple: initial === 'simple',
    isPro: initial === 'pro',
    setMode: (newMode) => {
      localStorage.setItem(STORAGE_KEY, newMode);
      set({ mode: newMode, isSimple: newMode === 'simple', isPro: newMode === 'pro' });
    },
    toggleMode: () =>
      set((state) => {
        const newMode: TradeMode = state.mode === 'simple' ? 'pro' : 'simple';
        localStorage.setItem(STORAGE_KEY, newMode);
        return { mode: newMode, isSimple: newMode === 'simple', isPro: newMode === 'pro' };
      }),
  };
});

export function useTradeMode() {
  return useTradeModeStore();
}
