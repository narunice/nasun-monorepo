import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getCooldownRemaining, setCooldownTimestamp, clearCooldownTimestamp, formatCooldownRemaining } from './faucetCooldown';

describe('faucetCooldown (daily reset at 00:00 UTC / 09:00 KST)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: set time to a specific UTC hour on a given date
  function setUTCTime(year: number, month: number, day: number, hour: number, minute = 0) {
    vi.setSystemTime(new Date(Date.UTC(year, month - 1, day, hour, minute)));
  }

  describe('getCooldownRemaining', () => {
    it('returns 0 when no timestamp is stored', () => {
      setUTCTime(2026, 3, 16, 12, 0);
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('returns 0 for invalid stored value', () => {
      setUTCTime(2026, 3, 16, 12, 0);
      localStorage.setItem('faucet_cooldown_0xabc_NBTC', 'not-a-number');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('returns 0 when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('returns remaining time until next 00:00 UTC when claimed in current period', () => {
      // Claim at 2026-03-16 15:00 UTC (Mar 16, midnight KST)
      setUTCTime(2026, 3, 16, 15, 0);
      setCooldownTimestamp('0xabc', 'NBTC');

      // Check at 18:00 UTC same day -- 6 hours until next reset (00:00 UTC Mar 17)
      setUTCTime(2026, 3, 16, 18, 0);
      const remaining = getCooldownRemaining('0xabc', 'NBTC');
      expect(remaining).toBe(6 * 3_600_000); // 6 hours
    });

    it('returns 0 after daily reset (claim yesterday, check today)', () => {
      // Claim at 2026-03-15 20:00 UTC
      setUTCTime(2026, 3, 15, 20, 0);
      setCooldownTimestamp('0xabc', 'NBTC');

      // Check at 2026-03-16 00:01 UTC (after reset)
      setUTCTime(2026, 3, 16, 0, 1);
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('reset boundary: claim at 23:59 UTC -> resets at 00:00 UTC next day', () => {
      // Claim at 23:59 UTC on Mar 15 (08:59 KST Mar 16)
      setUTCTime(2026, 3, 15, 23, 59);
      setCooldownTimestamp('0xabc', 'NBTC');

      // Still in cooldown at 23:59:30 UTC
      const stillCooling = getCooldownRemaining('0xabc', 'NBTC');
      expect(stillCooling).toBeGreaterThan(0);
      expect(stillCooling).toBeLessThanOrEqual(60_000); // < 1 minute

      // Reset at 00:00 UTC next day (09:00 KST)
      setUTCTime(2026, 3, 16, 0, 0);
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('claim right after reset -> cooldown until next reset', () => {
      // Claim at 00:01 UTC on Mar 16 (09:01 KST)
      setUTCTime(2026, 3, 16, 0, 1);
      setCooldownTimestamp('0xabc', 'NBTC');

      // Check at 12:00 UTC same day
      setUTCTime(2026, 3, 16, 12, 0);
      const remaining = getCooldownRemaining('0xabc', 'NBTC');
      expect(remaining).toBe(12 * 3_600_000); // 12 hours until next 00:00 UTC

      // Still locked at 23:59 UTC
      setUTCTime(2026, 3, 16, 23, 59);
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBeGreaterThan(0);

      // Free at 00:00 UTC next day
      setUTCTime(2026, 3, 17, 0, 0);
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('old claim from days ago -> no cooldown', () => {
      // Claim 3 days ago
      setUTCTime(2026, 3, 13, 10, 0);
      setCooldownTimestamp('0xabc', 'NBTC');

      // Check now
      setUTCTime(2026, 3, 16, 10, 0);
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });
  });

  describe('setCooldownTimestamp', () => {
    it('stores timestamp with correct key format', () => {
      setUTCTime(2026, 3, 16, 12, 0);
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

  describe('clearCooldownTimestamp', () => {
    it('removes cooldown and allows immediate claim', () => {
      setUTCTime(2026, 3, 16, 12, 0);
      setCooldownTimestamp('0xabc', 'NBTC');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBeGreaterThan(0);

      clearCooldownTimestamp('0xabc', 'NBTC');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
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
      expect(formatCooldownRemaining(45 * 60_000)).toBe('~45m');
    });

    it('returns <1m when less than 1 minute', () => {
      expect(formatCooldownRemaining(30_000)).toBe('<1m');
    });

    it('formats 0 minutes with hours correctly', () => {
      expect(formatCooldownRemaining(2 * 3_600_000)).toBe('~2h 0m');
    });
  });

  describe('address/symbol isolation', () => {
    it('different addresses have independent cooldowns', () => {
      setUTCTime(2026, 3, 16, 12, 0);
      setCooldownTimestamp('0xabc', 'NBTC');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBeGreaterThan(0);
      expect(getCooldownRemaining('0xdef', 'NBTC')).toBe(0);
    });

    it('different symbols have independent cooldowns', () => {
      setUTCTime(2026, 3, 16, 12, 0);
      setCooldownTimestamp('0xabc', 'NBTC');
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBeGreaterThan(0);
      expect(getCooldownRemaining('0xabc', 'NUSDC')).toBe(0);
    });
  });

  describe('migration from rolling window', () => {
    it('existing 24h-old timestamp is treated as expired (compatible)', () => {
      // Simulate old rolling-window timestamp from 25 hours ago
      setUTCTime(2026, 3, 16, 12, 0);
      const twentyFiveHoursAgo = Date.now() - 25 * 3_600_000;
      localStorage.setItem('faucet_cooldown_0xabc_NBTC', String(twentyFiveHoursAgo));
      expect(getCooldownRemaining('0xabc', 'NBTC')).toBe(0);
    });

    it('existing recent timestamp still has cooldown under new logic', () => {
      // Simulate claim 5 hours ago (still in same reset period)
      setUTCTime(2026, 3, 16, 15, 0); // 15:00 UTC
      const fiveHoursAgo = Date.now() - 5 * 3_600_000; // 10:00 UTC same day
      localStorage.setItem('faucet_cooldown_0xabc_NBTC', String(fiveHoursAgo));
      const remaining = getCooldownRemaining('0xabc', 'NBTC');
      // Should have cooldown until 00:00 UTC next day = 9 hours
      expect(remaining).toBe(9 * 3_600_000);
    });
  });
});
