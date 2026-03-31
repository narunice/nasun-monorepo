/**
 * BalanceManager Store
 *
 * Shared Zustand store for balanceManagerId so all components
 * using useTrading() see the same value. Solves the issue where
 * Enable Pado updates one hook instance's local state but other
 * instances (TradingPanel, BottomTabPanel, etc.) still see null.
 */

import { create } from 'zustand';

interface BalanceManagerState {
  balanceManagerId: string | null;
  isValidating: boolean;
  setBalanceManagerId: (id: string | null) => void;
  setIsValidating: (v: boolean) => void;
}

export const useBalanceManagerStore = create<BalanceManagerState>()((set) => ({
  balanceManagerId: null,
  isValidating: false,
  setBalanceManagerId: (id) => set({ balanceManagerId: id }),
  setIsValidating: (v) => set({ isValidating: v }),
}));
