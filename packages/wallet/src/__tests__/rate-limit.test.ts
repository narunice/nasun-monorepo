/**
 * Rate Limiting Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getUnlockAttemptState,
  saveUnlockAttemptState,
  calculateLockoutDuration,
  isLockedOut,
  getLockoutRemainingMs,
  recordFailedAttempt,
  resetUnlockAttempts,
  getLockoutInfo,
} from '../core/rate-limit';
import { DEFAULT_UNLOCK_ATTEMPT_STATE } from '../types';

describe('Rate Limiting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('calculateLockoutDuration', () => {
    it('returns 0 for attempts < 8', () => {
      expect(calculateLockoutDuration(0)).toBe(0);
      expect(calculateLockoutDuration(1)).toBe(0);
      expect(calculateLockoutDuration(7)).toBe(0);
    });

    it('returns 30s for 8-11 attempts', () => {
      expect(calculateLockoutDuration(8)).toBe(30 * 1000);
      expect(calculateLockoutDuration(9)).toBe(30 * 1000);
      expect(calculateLockoutDuration(11)).toBe(30 * 1000);
    });

    it('returns 5min for 12-15 attempts', () => {
      expect(calculateLockoutDuration(12)).toBe(5 * 60 * 1000);
      expect(calculateLockoutDuration(13)).toBe(5 * 60 * 1000);
      expect(calculateLockoutDuration(15)).toBe(5 * 60 * 1000);
    });

    it('returns 30min for 16+ attempts', () => {
      expect(calculateLockoutDuration(16)).toBe(30 * 60 * 1000);
      expect(calculateLockoutDuration(20)).toBe(30 * 60 * 1000);
      expect(calculateLockoutDuration(100)).toBe(30 * 60 * 1000);
    });
  });

  describe('getUnlockAttemptState / saveUnlockAttemptState', () => {
    it('returns default state when nothing stored', () => {
      const state = getUnlockAttemptState();
      expect(state).toEqual(DEFAULT_UNLOCK_ATTEMPT_STATE);
    });

    it('persists and retrieves state', () => {
      const testState = {
        failedAttempts: 5,
        lockoutEndTime: 12345678,
        lastAttemptTime: 12345000,
      };
      saveUnlockAttemptState(testState);

      const retrieved = getUnlockAttemptState();
      expect(retrieved).toEqual(testState);
    });

    it('handles corrupted localStorage gracefully', () => {
      localStorage.setItem('nasun_wallet_unlock_attempts', 'invalid json');
      const state = getUnlockAttemptState();
      expect(state).toEqual(DEFAULT_UNLOCK_ATTEMPT_STATE);
    });
  });

  describe('recordFailedAttempt', () => {
    it('increments failed attempts counter', () => {
      recordFailedAttempt();
      expect(getUnlockAttemptState().failedAttempts).toBe(1);

      recordFailedAttempt();
      expect(getUnlockAttemptState().failedAttempts).toBe(2);

      recordFailedAttempt();
      expect(getUnlockAttemptState().failedAttempts).toBe(3);
    });

    it('sets lockout time when threshold reached (8 attempts)', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // 7 attempts - no lockout
      for (let i = 0; i < 7; i++) {
        recordFailedAttempt();
      }
      expect(getUnlockAttemptState().lockoutEndTime).toBeNull();

      // 8th attempt - triggers lockout
      recordFailedAttempt();
      const state = getUnlockAttemptState();
      expect(state.failedAttempts).toBe(8);
      expect(state.lockoutEndTime).toBe(now + 30 * 1000);
    });

    it('persists state to localStorage', () => {
      recordFailedAttempt();
      const stored = localStorage.getItem('nasun_wallet_unlock_attempts');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.failedAttempts).toBe(1);
    });

    it('keeps counter after lockout expires (for progressive lockout)', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Simulate 8 failed attempts (triggers 30s lockout)
      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }
      expect(getUnlockAttemptState().failedAttempts).toBe(8);

      // Advance time past lockout
      vi.setSystemTime(now + 31 * 1000);

      // Next attempt should continue counter (not reset)
      recordFailedAttempt();
      expect(getUnlockAttemptState().failedAttempts).toBe(9);
    });
  });

  describe('isLockedOut', () => {
    it('returns false when no lockout', () => {
      expect(isLockedOut()).toBe(false);
    });

    it('returns true during lockout period', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Trigger lockout with 8 attempts
      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }

      expect(isLockedOut()).toBe(true);
    });

    it('returns false after lockout expires', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Trigger lockout
      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }
      expect(isLockedOut()).toBe(true);

      // Advance time past lockout (30s + 1s)
      vi.setSystemTime(now + 31 * 1000);
      expect(isLockedOut()).toBe(false);
    });
  });

  describe('getLockoutRemainingMs', () => {
    it('returns 0 when no lockout', () => {
      expect(getLockoutRemainingMs()).toBe(0);
    });

    it('returns remaining time during lockout', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Trigger lockout (30s)
      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }

      // Advance 10 seconds
      vi.setSystemTime(now + 10 * 1000);

      const remaining = getLockoutRemainingMs();
      expect(remaining).toBe(20 * 1000); // 30s - 10s = 20s
    });

    it('returns 0 after lockout expires', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }

      vi.setSystemTime(now + 31 * 1000);
      expect(getLockoutRemainingMs()).toBe(0);
    });
  });

  describe('resetUnlockAttempts', () => {
    it('clears all attempt data', () => {
      // Record some attempts
      for (let i = 0; i < 5; i++) {
        recordFailedAttempt();
      }
      expect(getUnlockAttemptState().failedAttempts).toBe(5);

      // Reset
      resetUnlockAttempts();
      expect(getUnlockAttemptState()).toEqual(DEFAULT_UNLOCK_ATTEMPT_STATE);
    });
  });

  describe('getLockoutInfo', () => {
    it('returns correct info when not locked out', () => {
      recordFailedAttempt();
      recordFailedAttempt();

      const info = getLockoutInfo();
      expect(info.isLockedOut).toBe(false);
      expect(info.remainingMs).toBe(0);
      expect(info.failedAttempts).toBe(2);
    });

    it('returns correct info when locked out', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }

      const info = getLockoutInfo();
      expect(info.isLockedOut).toBe(true);
      expect(info.remainingMs).toBe(30 * 1000);
      expect(info.failedAttempts).toBe(8);
    });
  });

  describe('Progressive lockout tiers', () => {
    it('applies 5min lockout at 12 attempts', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // First 8 attempts - 30s lockout
      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }
      expect(getLockoutRemainingMs()).toBe(30 * 1000);

      // Wait for lockout to expire
      vi.setSystemTime(now + 31 * 1000);

      // Next 4 attempts (total 12) - 5min lockout
      for (let i = 0; i < 4; i++) {
        recordFailedAttempt();
      }
      expect(getUnlockAttemptState().failedAttempts).toBe(12);
      expect(getLockoutRemainingMs()).toBe(5 * 60 * 1000);
    });

    it('applies 30min lockout at 16 attempts', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Get to 16 attempts
      for (let i = 0; i < 8; i++) {
        recordFailedAttempt();
      }
      vi.setSystemTime(now + 31 * 1000); // Skip past first lockout

      for (let i = 0; i < 4; i++) {
        recordFailedAttempt();
      }
      vi.setSystemTime(now + 31 * 1000 + 5 * 60 * 1000 + 1000); // Skip past second lockout

      for (let i = 0; i < 4; i++) {
        recordFailedAttempt();
      }

      expect(getUnlockAttemptState().failedAttempts).toBe(16);
      expect(getLockoutRemainingMs()).toBe(30 * 60 * 1000);
    });
  });
});
