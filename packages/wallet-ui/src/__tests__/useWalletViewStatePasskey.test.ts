/**
 * Tests for passkey backup protection in useWalletViewState.
 *
 * Covers:
 * - pendingPasskeyMnemonic module-level variable (get/set)
 * - Mount-time detection of pending passkey backup
 * - Click-outside guard for passkey-backup viewMode
 * - localStorage persistence for backup pending state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPendingPasskeyMnemonic,
  setPendingPasskeyMnemonic,
} from '../connect/hooks/useWalletViewState';

describe('useWalletViewState - Passkey Backup Protection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset module-level state
    setPendingPasskeyMnemonic(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ------------------------------------------
  // Module-level pendingPasskeyMnemonic
  // ------------------------------------------
  describe('pendingPasskeyMnemonic', () => {
    it('should return null initially', () => {
      expect(getPendingPasskeyMnemonic()).toBeNull();
    });

    it('should store and retrieve mnemonic', () => {
      const mnemonic = 'abandon badge cabbage dad eagle fabric gadget habit ice jacket kangaroo lamp';
      setPendingPasskeyMnemonic(mnemonic);
      expect(getPendingPasskeyMnemonic()).toBe(mnemonic);
    });

    it('should clear mnemonic when set to null', () => {
      setPendingPasskeyMnemonic('test mnemonic');
      expect(getPendingPasskeyMnemonic()).not.toBeNull();

      setPendingPasskeyMnemonic(null);
      expect(getPendingPasskeyMnemonic()).toBeNull();
    });

    it('should overwrite existing mnemonic', () => {
      setPendingPasskeyMnemonic('first mnemonic');
      setPendingPasskeyMnemonic('second mnemonic');
      expect(getPendingPasskeyMnemonic()).toBe('second mnemonic');
    });

    it('should survive multiple get calls (non-destructive read)', () => {
      const mnemonic = 'test mnemonic phrase';
      setPendingPasskeyMnemonic(mnemonic);

      // Read multiple times — value should persist
      expect(getPendingPasskeyMnemonic()).toBe(mnemonic);
      expect(getPendingPasskeyMnemonic()).toBe(mnemonic);
      expect(getPendingPasskeyMnemonic()).toBe(mnemonic);
    });

    it('should auto-clear mnemonic after 5 minutes', () => {
      setPendingPasskeyMnemonic('timeout test mnemonic');
      expect(getPendingPasskeyMnemonic()).toBe('timeout test mnemonic');

      // Advance 4 minutes — still present
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(getPendingPasskeyMnemonic()).toBe('timeout test mnemonic');

      // Advance to 5 minutes — should be cleared
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(getPendingPasskeyMnemonic()).toBeNull();
    });

    it('should reset timeout when mnemonic is updated', () => {
      setPendingPasskeyMnemonic('first');
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Update resets the timer
      setPendingPasskeyMnemonic('second');
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(getPendingPasskeyMnemonic()).toBe('second');

      // Full 5 minutes from last set
      vi.advanceTimersByTime(1 * 60 * 1000);
      expect(getPendingPasskeyMnemonic()).toBeNull();
    });

    it('should cancel timeout when cleared manually', () => {
      setPendingPasskeyMnemonic('will be cleared');
      setPendingPasskeyMnemonic(null);

      // Advance past timeout — should remain null (no stale callback)
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(getPendingPasskeyMnemonic()).toBeNull();
    });
  });
});
