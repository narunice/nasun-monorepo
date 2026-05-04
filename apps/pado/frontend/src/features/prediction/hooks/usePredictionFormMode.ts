/**
 * usePredictionFormMode
 *
 * Manages Simple/Advanced prediction order form mode with Zustand store +
 * localStorage persistence. Mirrors useTradeMode.ts pattern.
 *
 * Simple = market-buy only, minimal controls (default for new users)
 * Advanced = full controls (limit, sell/close, mint)
 */

import { create } from 'zustand';

export type PredictionFormMode = 'simple' | 'advanced';

const STORAGE_KEY = 'pado_prediction_formMode';

function readStoredMode(): PredictionFormMode {
  if (typeof window === 'undefined') return 'simple';
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'simple' || stored === 'advanced' ? stored : 'simple';
}

interface PredictionFormModeState {
  mode: PredictionFormMode;
  isSimple: boolean;
  isAdvanced: boolean;
  setMode: (mode: PredictionFormMode) => void;
  toggleMode: () => void;
}

const usePredictionFormModeStore = create<PredictionFormModeState>((set) => {
  const initial = readStoredMode();
  return {
    mode: initial,
    isSimple: initial === 'simple',
    isAdvanced: initial === 'advanced',
    setMode: (newMode) => {
      localStorage.setItem(STORAGE_KEY, newMode);
      set({ mode: newMode, isSimple: newMode === 'simple', isAdvanced: newMode === 'advanced' });
    },
    toggleMode: () =>
      set((state) => {
        const newMode: PredictionFormMode = state.mode === 'simple' ? 'advanced' : 'simple';
        localStorage.setItem(STORAGE_KEY, newMode);
        return { mode: newMode, isSimple: newMode === 'simple', isAdvanced: newMode === 'advanced' };
      }),
  };
});

export function usePredictionFormMode() {
  return usePredictionFormModeStore();
}
