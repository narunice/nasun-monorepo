import { describe, it, expect } from 'vitest';
import { getNotificationPrefs, setNotificationPrefs } from './notification-preferences';

// ========================================
// getNotificationPrefs
// ========================================
describe('getNotificationPrefs', () => {
  it('returns defaults when localStorage is empty', () => {
    const prefs = getNotificationPrefs();
    expect(prefs).toEqual({
      soundEnabled: true,
      soundVolume: 0.5,
      browserNotifyEnabled: false,
      priceAlertEnabled: true,
    });
  });

  it('returns saved preferences', () => {
    const saved = {
      soundEnabled: false,
      soundVolume: 0.8,
      browserNotifyEnabled: true,
      priceAlertEnabled: false,
    };
    localStorage.setItem('pado:notification:prefs', JSON.stringify(saved));
    expect(getNotificationPrefs()).toEqual(saved);
  });

  it('clamps soundVolume to [0, 1] range', () => {
    localStorage.setItem('pado:notification:prefs', JSON.stringify({
      soundEnabled: true,
      soundVolume: 5.0, // Out of range
      browserNotifyEnabled: false,
      priceAlertEnabled: true,
    }));
    const prefs = getNotificationPrefs();
    expect(prefs.soundVolume).toBe(1);
  });

  it('clamps negative soundVolume to 0', () => {
    localStorage.setItem('pado:notification:prefs', JSON.stringify({
      soundEnabled: true,
      soundVolume: -2.0,
      browserNotifyEnabled: false,
      priceAlertEnabled: true,
    }));
    expect(getNotificationPrefs().soundVolume).toBe(0);
  });

  it('uses defaults for missing keys', () => {
    localStorage.setItem('pado:notification:prefs', JSON.stringify({
      soundEnabled: false,
    }));
    const prefs = getNotificationPrefs();
    expect(prefs.soundEnabled).toBe(false);
    expect(prefs.soundVolume).toBe(0.5);
    expect(prefs.browserNotifyEnabled).toBe(false);
    expect(prefs.priceAlertEnabled).toBe(true);
  });

  it('uses defaults for wrong types', () => {
    localStorage.setItem('pado:notification:prefs', JSON.stringify({
      soundEnabled: 'yes', // wrong type
      soundVolume: 'loud', // wrong type
      browserNotifyEnabled: 1, // wrong type
    }));
    const prefs = getNotificationPrefs();
    expect(prefs.soundEnabled).toBe(true); // default
    expect(prefs.soundVolume).toBe(0.5); // default
    expect(prefs.browserNotifyEnabled).toBe(false); // default
  });

  it('returns defaults for invalid JSON', () => {
    localStorage.setItem('pado:notification:prefs', 'corrupted');
    expect(getNotificationPrefs().soundEnabled).toBe(true);
  });

  it('returns defaults for null value', () => {
    localStorage.setItem('pado:notification:prefs', 'null');
    expect(getNotificationPrefs().soundEnabled).toBe(true);
  });

  it('prevents prototype pollution (ignores __proto__)', () => {
    const malicious = '{"__proto__":{"polluted":true},"soundEnabled":false}';
    localStorage.setItem('pado:notification:prefs', malicious);
    const prefs = getNotificationPrefs();
    expect(prefs.soundEnabled).toBe(false);
    expect((prefs as unknown as Record<string, unknown>).__proto__).toBeDefined(); // normal proto
    expect((prefs as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ========================================
// setNotificationPrefs
// ========================================
describe('setNotificationPrefs', () => {
  it('saves partial preferences merged with defaults', () => {
    setNotificationPrefs({ soundEnabled: false });
    const prefs = getNotificationPrefs();
    expect(prefs.soundEnabled).toBe(false);
    expect(prefs.soundVolume).toBe(0.5); // default preserved
  });

  it('clamps volume on save', () => {
    setNotificationPrefs({ soundVolume: 2.0 });
    expect(getNotificationPrefs().soundVolume).toBe(1);

    setNotificationPrefs({ soundVolume: -1.0 });
    expect(getNotificationPrefs().soundVolume).toBe(0);
  });

  it('overwrites previous values', () => {
    setNotificationPrefs({ soundEnabled: false, browserNotifyEnabled: true });
    expect(getNotificationPrefs().soundEnabled).toBe(false);
    expect(getNotificationPrefs().browserNotifyEnabled).toBe(true);

    setNotificationPrefs({ soundEnabled: true });
    expect(getNotificationPrefs().soundEnabled).toBe(true);
    expect(getNotificationPrefs().browserNotifyEnabled).toBe(true); // preserved
  });
});
