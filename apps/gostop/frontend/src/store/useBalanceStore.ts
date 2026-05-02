import { create } from 'zustand'

interface BalanceState {
  /** Total NUSDC balance fetched from chain (base units, 6 decimals) */
  totalNusdc: bigint
  /** Amount currently locked in pending transactions */
  pendingBetsNusdc: bigint
  /** Whether the initial balance fetch has happened */
  isInitialized: boolean
  
  // Actions
  setBalance: (amount: bigint) => void
  addPendingBet: (amount: bigint) => void
  removePendingBet: (amount: bigint) => void
  resetPending: () => void
}

/**
 * useBalanceStore - Manages user balance with optimistic updates support.
 * The UI should display (totalNusdc - pendingBetsNusdc).
 */
export const useBalanceStore = create<BalanceState>((set) => ({
  totalNusdc: 0n,
  pendingBetsNusdc: 0n,
  isInitialized: false,

  setBalance: (amount) => set({ totalNusdc: amount, isInitialized: true }),
  
  addPendingBet: (amount) => set((state) => ({ 
    pendingBetsNusdc: state.pendingBetsNusdc + amount 
  })),
  
  removePendingBet: (amount) => set((state) => ({ 
    pendingBetsNusdc: state.pendingBetsNusdc > amount ? state.pendingBetsNusdc - amount : 0n
  })),
  
  resetPending: () => set({ pendingBetsNusdc: 0n }),
}))

/**
 * Hook for UI components to get the "Optimistic" balance.
 */
export function useOptimisticBalance() {
  const total = useBalanceStore((s) => s.totalNusdc)
  const pending = useBalanceStore((s) => s.pendingBetsNusdc)
  const isInitialized = useBalanceStore((s) => s.isInitialized)
  
  return {
    balance: total - pending,
    isInitialized
  }
}
