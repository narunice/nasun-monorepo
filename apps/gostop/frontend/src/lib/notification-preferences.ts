/**
 * Notification preferences (gostop).
 *
 * Persists sound on/off + volume in localStorage. Default soundEnabled=false
 * (a11y-first; first big/jackpot win surfaces an opt-in prompt).
 *
 * Ported from pado lib/notification-preferences.ts. Storage key prefixed
 * with `gostop:` to keep apps isolated.
 */

const STORAGE_KEY = 'gostop:notification:prefs'

export interface NotificationPreferences {
  soundEnabled: boolean
  /** 0-1 */
  soundVolume: number
}

const DEFAULTS: NotificationPreferences = {
  soundEnabled: false,
  soundVolume: 0.5,
}

export function getNotificationPrefs(): NotificationPreferences {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS }
    return {
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULTS.soundEnabled,
      soundVolume:
        typeof parsed.soundVolume === 'number' && Number.isFinite(parsed.soundVolume)
          ? Math.max(0, Math.min(1, parsed.soundVolume))
          : DEFAULTS.soundVolume,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setNotificationPrefs(partial: Partial<NotificationPreferences>): void {
  if (typeof window === 'undefined') return
  const current = getNotificationPrefs()
  const updated = { ...current, ...partial }
  updated.soundVolume = Math.max(0, Math.min(1, updated.soundVolume))
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('gostop:prefs:changed'))
  } catch {
    // localStorage full / disabled — silently ignore
  }
}
