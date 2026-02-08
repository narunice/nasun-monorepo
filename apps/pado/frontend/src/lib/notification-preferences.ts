/**
 * Notification Preferences
 *
 * Persists user notification settings in localStorage.
 * Controls sound effects, browser notifications, and price alerts.
 */

const STORAGE_KEY = 'pado:notification:prefs';

export interface NotificationPreferences {
  /** Enable trading sound effects */
  soundEnabled: boolean;
  /** Sound volume (0-1) */
  soundVolume: number;
  /** Enable browser push notifications (requires permission) */
  browserNotifyEnabled: boolean;
  /** Enable price alert monitoring */
  priceAlertEnabled: boolean;
}

const DEFAULTS: NotificationPreferences = {
  soundEnabled: true,
  soundVolume: 0.5,
  browserNotifyEnabled: false,
  priceAlertEnabled: true,
};

export function getNotificationPrefs(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULTS };
    // Only pick expected keys with type validation to prevent prototype pollution
    return {
      soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : DEFAULTS.soundEnabled,
      soundVolume: typeof parsed.soundVolume === 'number' && Number.isFinite(parsed.soundVolume) ? Math.max(0, Math.min(1, parsed.soundVolume)) : DEFAULTS.soundVolume,
      browserNotifyEnabled: typeof parsed.browserNotifyEnabled === 'boolean' ? parsed.browserNotifyEnabled : DEFAULTS.browserNotifyEnabled,
      priceAlertEnabled: typeof parsed.priceAlertEnabled === 'boolean' ? parsed.priceAlertEnabled : DEFAULTS.priceAlertEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setNotificationPrefs(
  partial: Partial<NotificationPreferences>
): void {
  const current = getNotificationPrefs();
  const updated = { ...current, ...partial };

  // Clamp volume to valid range
  updated.soundVolume = Math.max(0, Math.min(1, updated.soundVolume));

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage full — silently fail
  }
}
