import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastState {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  showToast: (message, type = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }))
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

/**
 * Hook-like alias for convenience, keeping the same API as the old Context-based useToast.
 */
export function useToast() {
  const showToast = useToastStore((s) => s.showToast)
  return { showToast }
}

/**
 * Static access for non-React code (e.g. WebSocket handlers, plain JS utils).
 */
export const toast = {
  show: (message: string, type: ToastType = 'info') => useToastStore.getState().showToast(message, type),
  success: (message: string) => useToastStore.getState().showToast(message, 'success'),
  error: (message: string) => useToastStore.getState().showToast(message, 'error'),
  info: (message: string) => useToastStore.getState().showToast(message, 'info'),
  warning: (message: string) => useToastStore.getState().showToast(message, 'warning'),
}
