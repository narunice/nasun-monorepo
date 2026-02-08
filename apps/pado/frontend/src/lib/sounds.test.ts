import { describe, it, expect, vi } from 'vitest';
import { playSound } from './sounds';
import { setNotificationPrefs } from './notification-preferences';
import type { TradingSound } from './sounds';

// ========================================
// playSound
// ========================================
describe('playSound', () => {
  it('does not throw when soundEnabled is false', () => {
    setNotificationPrefs({ soundEnabled: false });
    expect(() => playSound('orderPlaced')).not.toThrow();
  });

  it('does not throw when soundEnabled is true', () => {
    setNotificationPrefs({ soundEnabled: true, soundVolume: 0.5 });
    expect(() => playSound('orderPlaced')).not.toThrow();
  });

  it('plays all sound types without errors', () => {
    setNotificationPrefs({ soundEnabled: true, soundVolume: 0.5 });
    const sounds: TradingSound[] = ['orderPlaced', 'orderFilled', 'tpslTriggered', 'priceAlert', 'error'];
    for (const sound of sounds) {
      expect(() => playSound(sound)).not.toThrow();
    }
  });

  it('respects zero volume', () => {
    setNotificationPrefs({ soundEnabled: true, soundVolume: 0 });
    expect(() => playSound('orderFilled')).not.toThrow();
  });
});
