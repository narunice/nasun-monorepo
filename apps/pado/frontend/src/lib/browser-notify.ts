/**
 * Browser Notification API Wrapper
 *
 * Sends native browser notifications when the tab is in the background.
 * Respects user preferences and gracefully handles unsupported browsers.
 */

import { getNotificationPrefs } from './notification-preferences';

export function isBrowserNotifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotifyPermission(): NotificationPermission {
  if (!isBrowserNotifySupported()) return 'denied';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowserNotifySupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

interface BrowserNotifyOptions {
  body?: string;
  tag?: string;
  icon?: string;
}

/**
 * Send a browser notification.
 * Only fires when:
 * - Browser supports Notification API
 * - Permission is granted
 * - User has browserNotifyEnabled in preferences
 * - Tab is not visible (document.hidden)
 */
export function sendBrowserNotification(
  title: string,
  options?: BrowserNotifyOptions
): void {
  const prefs = getNotificationPrefs();
  if (!prefs.browserNotifyEnabled) return;
  if (!isBrowserNotifySupported()) return;
  if (Notification.permission !== 'granted') return;

  // Only notify when tab is in the background
  if (!document.hidden) return;

  try {
    const notification = new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      icon: options?.icon ?? '/pado-favicon.svg',
    });

    // Auto-close after 8 seconds
    setTimeout(() => notification.close(), 8_000);

    // Focus the tab when notification is clicked
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Silently fail (e.g., service worker not available)
  }
}
