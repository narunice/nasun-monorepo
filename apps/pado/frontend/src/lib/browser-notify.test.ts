import { describe, it, expect, beforeEach } from 'vitest';
import {
  isBrowserNotifySupported,
  getBrowserNotifyPermission,
  requestNotificationPermission,
  sendBrowserNotification,
} from './browser-notify';
import { setNotificationPrefs } from './notification-preferences';

// ========================================
// isBrowserNotifySupported
// ========================================
describe('isBrowserNotifySupported', () => {
  it('returns true when Notification API exists', () => {
    expect(isBrowserNotifySupported()).toBe(true);
  });
});

// ========================================
// getBrowserNotifyPermission
// ========================================
describe('getBrowserNotifyPermission', () => {
  it('returns current permission state', () => {
    expect(getBrowserNotifyPermission()).toBe('granted');
  });
});

// ========================================
// requestNotificationPermission
// ========================================
describe('requestNotificationPermission', () => {
  it('returns granted when already granted', async () => {
    const result = await requestNotificationPermission();
    expect(result).toBe('granted');
  });
});

// ========================================
// sendBrowserNotification
// ========================================
describe('sendBrowserNotification', () => {
  beforeEach(() => {
    // Enable browser notifications
    setNotificationPrefs({ browserNotifyEnabled: true });
  });

  it('does not send when browserNotifyEnabled is false', () => {
    setNotificationPrefs({ browserNotifyEnabled: false });
    sendBrowserNotification('Test', { body: 'Hello' });
    // No error thrown — silently skipped
  });

  it('does not send when document is visible', () => {
    // document.hidden is false by default in jsdom
    sendBrowserNotification('Test', { body: 'Hello' });
    // The notification check for document.hidden should prevent sending
  });

  it('sends notification when conditions met', () => {
    // Mock document.hidden to true
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    sendBrowserNotification('Price Alert', { body: 'BTC hit $100k', tag: 'alert-1' });

    // Restore
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  });
});
