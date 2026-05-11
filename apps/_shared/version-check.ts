// Runtime polling for /version.json + safe auto-reload on new deploys.
//
// Why this exists:
//   Even with correct `Cache-Control: no-store` on index.html, users with an
//   open tab keep running the JS bundle that was loaded when the tab first
//   opened. There is no automatic mechanism to pick up a hotfix until they
//   manually refresh. This module bridges that gap.
//
// Reload policy (safety-first):
//   When a new version is detected, we wait for the FIRST safe trigger:
//     1. Tab becomes visible after being hidden (natural reload moment)
//     2. SPA route change (call notifyRouteChange() from your router)
//     3. User idle for `idleMs` (default 2 min) — no recent input
//     4. Hard timeout `hardTimeoutMs` (default 10 min) after detection
//   On every trigger we additionally check the app-supplied
//   `isUnsafeToReload()` callback (e.g. "wallet popup open", "game round
//   active") and defer if it returns true.
//
//   A 60s sessionStorage guard prevents reload loops if the CDN serves a
//   genuinely newer version.json than the deployed index.html.
//
// Privacy / security:
//   version.json contains only { version, buildTime } — no secrets. The
//   endpoint must be served with `Cache-Control: no-store` at the origin;
//   we add `?t=` cache-bust + `cache: 'no-store'` request header but the
//   origin must cooperate or polling becomes a no-op.

export type VersionCheckOptions = {
  /** Endpoint to poll. Default: '/version.json'. */
  endpoint?: string
  /** Poll interval while tab is visible. Default: 5 min. */
  intervalMs?: number
  /** Idle reload trigger threshold. Default: 2 min. */
  idleMs?: number
  /** Hard-timeout reload after detection. Default: 10 min. */
  hardTimeoutMs?: number
  /** Min interval between reload attempts (loop guard). Default: 60s. */
  reloadGuardMs?: number
  /** Return true to defer reload (e.g. active signing, game round, focused form). */
  isUnsafeToReload?: () => boolean
  /** Called once when a new version is first detected. */
  onUpdateAvailable?: (newVersion: string, currentVersion: string) => void
  /** Called immediately before the reload fires. Use for last-second persistence. */
  onReload?: () => void
}

export type VersionCheckHandle = {
  stop: () => void
  /** Call from your SPA router's route-change hook. */
  notifyRouteChange: () => void
  /** Snapshot for debugging. */
  state: () => {
    initialVersion: string | null
    latestVersion: string | null
    mismatchSince: number | null
    mismatchCount: number
  }
}

const SESSION_KEY = 'nasun-version-reload-at'

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'pointerdown', 'wheel'] as const

export function startVersionCheck(opts: VersionCheckOptions = {}): VersionCheckHandle {
  const endpoint = opts.endpoint ?? '/version.json'
  const intervalMs = opts.intervalMs ?? 5 * 60 * 1000
  const idleMs = opts.idleMs ?? 2 * 60 * 1000
  const hardTimeoutMs = opts.hardTimeoutMs ?? 10 * 60 * 1000
  const reloadGuardMs = opts.reloadGuardMs ?? 60 * 1000

  let initialVersion: string | null = null
  let latestVersion: string | null = null
  let mismatchSince: number | null = null
  let mismatchCount = 0
  let lastActivityAt = Date.now()
  let stopped = false
  let pollTimerId: ReturnType<typeof setInterval> | null = null
  let idleTimerId: ReturnType<typeof setInterval> | null = null
  let hardTimeoutId: ReturnType<typeof setTimeout> | null = null

  const fetchVersion = async (): Promise<string | null> => {
    try {
      const res = await fetch(`${endpoint}?t=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'omit',
      })
      if (!res.ok) return null
      const data = await res.json() as { version?: unknown }
      return typeof data.version === 'string' ? data.version : null
    } catch {
      return null
    }
  }

  const passesLoopGuard = (): boolean => {
    try {
      const last = sessionStorage.getItem(SESSION_KEY)
      if (last && Date.now() - Number(last) < reloadGuardMs) return false
    } catch {
      // sessionStorage unavailable (private mode, sandboxed iframe) — allow
    }
    return true
  }

  const performReload = () => {
    if (stopped) return
    if (mismatchSince === null) return
    if (!passesLoopGuard()) return
    if (opts.isUnsafeToReload?.()) return
    try {
      sessionStorage.setItem(SESSION_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    try {
      opts.onReload?.()
    } catch {
      // ignore onReload errors — never block the reload
    }
    window.location.reload()
  }

  const tick = async () => {
    if (stopped) return
    if (typeof document !== 'undefined' && document.hidden) return
    const current = await fetchVersion()
    if (!current) return
    latestVersion = current
    if (initialVersion === null) {
      initialVersion = current
      return
    }
    if (current !== initialVersion) {
      mismatchCount += 1
      // require two consecutive mismatches to absorb CDN edge inconsistency
      if (mismatchCount < 2) return
      if (mismatchSince === null) {
        mismatchSince = Date.now()
        try {
          opts.onUpdateAvailable?.(current, initialVersion)
        } catch {
          // ignore
        }
        hardTimeoutId = setTimeout(performReload, hardTimeoutMs)
      }
      performReload()
    } else {
      mismatchCount = 0
    }
  }

  const onVisibilityChange = () => {
    if (typeof document === 'undefined' || document.hidden) return
    // user just returned to tab — natural reload moment
    performReload()
    void tick()
  }

  const onActivity = () => {
    lastActivityAt = Date.now()
  }

  const idleCheck = () => {
    if (stopped || mismatchSince === null) return
    if (Date.now() - lastActivityAt >= idleMs) performReload()
  }

  const notifyRouteChange = () => {
    performReload()
  }

  // ---- start ----
  void tick()
  pollTimerId = setInterval(() => { void tick() }, intervalMs)
  idleTimerId = setInterval(idleCheck, 30 * 1000)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', notifyRouteChange)
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true })
    }
  }

  return {
    stop() {
      stopped = true
      if (pollTimerId !== null) clearInterval(pollTimerId)
      if (idleTimerId !== null) clearInterval(idleTimerId)
      if (hardTimeoutId !== null) clearTimeout(hardTimeoutId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('popstate', notifyRouteChange)
        for (const ev of ACTIVITY_EVENTS) {
          window.removeEventListener(ev, onActivity)
        }
      }
    },
    notifyRouteChange,
    state: () => ({ initialVersion, latestVersion, mismatchSince, mismatchCount }),
  }
}
