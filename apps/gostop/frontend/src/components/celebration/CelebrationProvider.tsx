/**
 * CelebrationProvider — App-root mount.
 *
 * Splits dispatch context (stable callback) from state context (config the
 * overlay subscribes to) so calling `celebrate(...)` from a game page does
 * not re-render the rest of the route tree.
 *
 * `celebrate(...)` is fire-and-forget. Caller must not await it. Page
 * navigation aborts an in-flight celebration (best-effort visual cleanup).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorBoundary } from '../ErrorBoundary'
import { CelebrationOverlayHost } from './CelebrationOverlayHost'
import type { CelebrationConfig } from './types'

type CelebrateInput = Omit<CelebrationConfig, 'key'>

type DispatchFn = (cfg: CelebrateInput) => void

const CelebrationDispatchContext = createContext<DispatchFn>(() => {
  // No-op default. Calling celebrate() before the provider mounts is a bug,
  // but we silently ignore so a stray call cannot crash the app.
})

const CelebrationStateContext = createContext<CelebrationConfig | null>(null)

export function useCelebrate(): DispatchFn {
  return useContext(CelebrationDispatchContext)
}

/** For internal use by the overlay host. */
export function useCelebrationState(): CelebrationConfig | null {
  return useContext(CelebrationStateContext)
}

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CelebrationConfig | null>(null)
  const counterRef = useRef(0)

  const dispatch = useCallback<DispatchFn>((cfg) => {
    counterRef.current += 1
    const key = `celebration-${Date.now()}-${counterRef.current}`
    setConfig({ ...cfg, key })
  }, [])

  const dismiss = useCallback(() => {
    setConfig(null)
  }, [])

  // Dismiss any in-flight celebration when the user navigates to a different page.
  const { pathname } = useLocation()
  useEffect(() => {
    dismiss()
  }, [pathname, dismiss])

  // Stable wrapper so dispatch identity is preserved across renders.
  const dispatchValue = useMemo(() => dispatch, [dispatch])

  return (
    <CelebrationDispatchContext.Provider value={dispatchValue}>
      <CelebrationStateContext.Provider value={config}>
        {children}
        <ErrorBoundary label="CelebrationOverlayHost">
          <CelebrationOverlayHost onComplete={dismiss} />
        </ErrorBoundary>
      </CelebrationStateContext.Provider>
    </CelebrationDispatchContext.Provider>
  )
}
