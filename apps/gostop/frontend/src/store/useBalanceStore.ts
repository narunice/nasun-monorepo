import { create } from 'zustand'

interface BalanceState {
  /** Total NUSDC balance fetched from chain (base units, 6 decimals) */
  totalNusdc: bigint
  /** Amount currently locked in pending transactions */
  pendingBetsNusdc: bigint
  /** Whether the initial balance fetch has happened */
  isInitialized: boolean
  /**
   * While > 0, chain balances are staged instead of shown. Games with a reveal
   * animation hold the balance so the post-payout number cannot appear before
   * the reveal and give the outcome away.
   */
  revealHolds: number
  /** Balance that arrived during a hold, applied when the last hold releases */
  heldNusdc: bigint | null

  // Actions
  setBalance: (amount: bigint) => void
  addPendingBet: (amount: bigint) => void
  removePendingBet: (amount: bigint) => void
  resetPending: () => void
  holdForReveal: () => void
  releaseReveal: () => void
  reset: () => void
}

/**
 * useBalanceStore - Manages user balance with optimistic updates support.
 * The UI should display (totalNusdc - pendingBetsNusdc).
 */
export const useBalanceStore = create<BalanceState>((set) => ({
  totalNusdc: 0n,
  pendingBetsNusdc: 0n,
  isInitialized: false,
  revealHolds: 0,
  heldNusdc: null,

  // Deferring the post-transaction refresh is not enough on its own:
  // useBalanceSync polls every 15s from the app root, so a poll landing between
  // the transaction confirming and the reveal finishing would still leak the
  // result. Staging writes here closes that window for every caller at once.
  setBalance: (amount) =>
    set((state) =>
      state.revealHolds > 0
        ? { heldNusdc: amount, isInitialized: true }
        : { totalNusdc: amount, isInitialized: true }
    ),

  addPendingBet: (amount) => set((state) => ({ 
    pendingBetsNusdc: state.pendingBetsNusdc + amount 
  })),
  
  removePendingBet: (amount) => set((state) => ({ 
    pendingBetsNusdc: state.pendingBetsNusdc > amount ? state.pendingBetsNusdc - amount : 0n
  })),
  
  resetPending: () => set({ pendingBetsNusdc: 0n }),

  // Counted rather than boolean so overlapping reveals cannot release early.
  holdForReveal: () => set((state) => ({ revealHolds: state.revealHolds + 1 })),

  releaseReveal: () =>
    set((state) => {
      const revealHolds = Math.max(0, state.revealHolds - 1)
      if (revealHolds > 0) return { revealHolds }
      return {
        revealHolds,
        heldNusdc: null,
        ...(state.heldNusdc !== null ? { totalNusdc: state.heldNusdc } : {}),
      }
    }),

  reset: () =>
    set({
      totalNusdc: 0n,
      pendingBetsNusdc: 0n,
      isInitialized: false,
      revealHolds: 0,
      heldNusdc: null,
    }),
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
