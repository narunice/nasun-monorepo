import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCooldownRemaining, setCooldownTimestamp, formatCooldownRemaining } from './faucetCooldown';

describe('faucetCooldown', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('getCooldownRemaining', () => {
    it('returns 0 when no timestamp is stored', () => {
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('returns remaining ms when within 24h window', () => {
      const fiveHoursAgo = Date.now() - 5 * 3_600_000;
      localStorage.setItem('faucet_cooldown_0xabc_NBTC', String(fiveHoursAgo));
      const remaining = getCooldownRemaining('0xabc', 'NBTC');
      expect(remaining).toBeGreaterThan(18 * 3_600_000);
      expect(remaining).toBeLessThanOrEqual(19 * 3_600_000 + 1000);
    });

    it('returns 0 when cooldown has expired (>= 24h)', () => {
      const twentyFiveHoursAgo = Date.now() - 25 * 3_600_000;
      localStorage.setItem('faucet_cooldown_0xabc_NBTC', String(twentyFiveHoursAgo));
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('returns 0 for invalid stored value', () => {
      localStorage.setItem('faucet_cooldown_0xabc_NBTC', 'not-a-number');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('returns 0 when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });
  });

  describe('setCooldownTimestamp', () => {
    it('stores timestamp with correct key format', () => {
      setCooldownTimestamp('0xabc', 'NBTC');
      const stored = localStorage.getItem('faucet_cooldown_0xabc_NBTC');
      expect(stored).toBeTruthy();
      const timestamp = parseInt(stored!, 10);
      expect(Math.abs(timestamp - Date.now())).toBeLessThan(1000);
    });

    it('does not throw when localStorage is unavailable', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(() => setCooldownTimestamp('0xabc', 'NBTC')).not.toThrow();
    });
  });

  describe('formatCooldownRemaining', () => {
    it('returns empty string for 0', () => {
      expect(formatCooldownRemaining(0)).toBe('');
    });

    it('returns empty string for negative values', () => {
      expect(formatCooldownRemaining(-1000)).toBe('');
    });

    it('formats hours and minutes', () => {
      const ms = 23 * 3_600_000 + 15 * 60_000;
      expect(formatCooldownRemaining(ms)).toBe('~23h 15m');
    });

    it('formats minutes only when < 1 hour', () => {
      const ms = 45 * 60_000;
      expect(formatCooldownRemaining(ms)).toBe('~45m');
    });

    it('returns <1m when less than 1 minute', () => {
      expect(formatCooldownRemaining(30_000)).toBe('<1m');
    });

    it('formats 0 minutes with hours correctly', () => {
      const ms = 2 * 3_600_000;
      expect(formatCooldownRemaining(ms)).toBe('~2h 0m');
    });
  });

  describe('address/symbol isolation', () => {
    it('different addresses have independent cooldowns', () => {
      setCooldownTimestamp('0xabc', 'NBTC');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBeGreaterThan(0);
      expect(getCooldownRemaining('0xdef', 'NBTC')).toBe(0);
    });

    it('different symbols have independent cooldowns', () => {
      setCooldownTimestamp('0xabc', 'NBTC');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBeGreaterThan(0);
      expect(getCooldownRemaining('0xabc', 'NUSDC')).toBe(0);
    });
  });
});
