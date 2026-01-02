/**
 * zkLogin Global Store
 *
 * Zustand store for zkLogin state management.
 * All components using useZkLogin will share the same state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ZkLoginState, ZkLoginError } from '../types/zklogin';

interface ZkLoginStore {
  /** Current zkLogin state (null if not logged in) */
  state: ZkLoginState | null;
  /** Whether zkLogin is currently active */
  isConnected: boolean;
  /** Whether a login operation is in progress */
  isLoading: boolean;
  /** Current error (if any) */
  error: ZkLoginError | null;
  /** Set zkLogin state after successful login */
  setState: (state: ZkLoginState) => void;
  /** Clear all zkLogin state (logout) */
  clearState: () => void;
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error state */
  setError: (error: ZkLoginError | null) => void;
}

export const useZkLoginStore = create<ZkLoginStore>()(
  persist(
    (set) => ({
      state: null,
      isConnected: false,
      isLoading: false,
      error: null,
      setState: (state) => set({
        state,
        isConnected: !!state?.proof,
        error: null,
      }),
      clearState: () => set({
        state: null,
        isConnected: false,
        error: null,
      }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'nasun:zklogin',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist essential state, not loading/error
      partialize: (state) => ({
        state: state.state,
        isConnected: state.isConnected,
      }),
    }
  )
);
