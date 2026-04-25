/**
 * Subscribes to notification preferences changes via the gostop:prefs:changed
 * event dispatched by setNotificationPrefs. Returns the latest value.
 */

import { useSyncExternalStore } from 'react'
import { getNotificationPrefs, type NotificationPreferences } from '../lib/notification-preferences'

const EVENT = 'gostop:prefs:changed'

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  // Cross-tab sync via storage event (best-effort)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

// Reference-stable cache so React's external store check (===) doesn't loop.
let cached: NotificationPreferences = getNotificationPrefs()
let cachedJson = JSON.stringify(cached)

function getSnapshot(): NotificationPreferences {
  const next = getNotificationPrefs()
  const nextJson = JSON.stringify(next)
  if (nextJson !== cachedJson) {
    cached = next
    cachedJson = nextJson
  }
  return cached
}

function getServerSnapshot(): NotificationPreferences {
  return cached
}

export function useNotificationPrefs(): NotificationPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
