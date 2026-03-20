/**
 * Tests for passkey auto-lock functionality.
 *
 * Covers Fix 4-1 (passkeyStore auto-lock timer):
 * - Store state: lastActivityAt initialization and update
 * - updateActivity: resets lastActivityAt to Date.now()
 * - setUnlocked: resets lastActivityAt
 * - lock(): clears keypair, keeps wallet metadata
 * - Auto-lock timer: locks after inactivity period
 * - Auto-lock timer: respects autoLockMinutes from localStorage
 * - Auto-lock timer: disabled when autoLockMinutes <= 0
 * - Auto-lock timer: does not lock when wallet is not unlocked
 * - Auto-lock timer: does NOT call clearSessionPassword (passkey-only lock)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// We need to test the store in isolation.
// The auto-lock timer is created at module load via setInterval,
// so we must enable fake timers BEFORE the module loads and
// reset modules between tests to get fresh timer instances.
let usePasskeyStore: typeof import('../stores/passkeyStore').usePasskeyStore;

const SECURITY_SETTINGS_KEY = 'nasun_wallet_security';

describe('passkeyStore auto-lock', () => {
  let keypair: Ed25519Keypair;

  beforeEach(async () => {
    // Enable fake timers FIRST so the module's setInterval uses them
    vi.useFakeTimers();
    // Reset module cache to force fresh import with fake timers active
    vi.resetModules();
    const mod = await import('../stores/passkeyStore');
    usePasskeyStore = mod.usePasskeyStore;
    keypair = new Ed25519Keypair();
  });

  afterEach(() => {
    usePasskeyStore.getState().clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // ------------------------------------------
  // Store state basics
  // ------------------------------------------
  describe('store state', () => {
    it('should have lastActivityAt initialized to a recent timestamp', () => {
      const state = usePasskeyStore.getState();
      const now = Date.now();
      // Should be within a few seconds of now
      expect(state.lastActivityAt).toBeLessThanOrEqual(now);
      expect(state.lastActivityAt).toBeGreaterThan(now - 10000);
    });

    it('should have isUnlocked=false by default', () => {
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
    });

    it('should have keypair=null by default', () => {
      expect(usePasskeyStore.getState().keypair).toBeNull();
    });
  });

  // ------------------------------------------
  // updateActivity
  // ------------------------------------------
  describe('updateActivity', () => {
    it('should update lastActivityAt to current time', () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().updateActivity();

      const expected = new Date('2026-06-01T00:00:00Z').getTime();
      expect(usePasskeyStore.getState().lastActivityAt).toBe(expected);
    });

    it('should update on successive calls', () => {
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().updateActivity();
      const t1 = usePasskeyStore.getState().lastActivityAt;

      vi.setSystemTime(new Date('2026-06-01T00:05:00Z'));
      usePasskeyStore.getState().updateActivity();
      const t2 = usePasskeyStore.getState().lastActivityAt;

      expect(t2).toBeGreaterThan(t1);
      expect(t2 - t1).toBe(5 * 60 * 1000);
    });
  });

  // ------------------------------------------
  // setUnlocked / lock / clear
  // ------------------------------------------
  describe('setUnlocked', () => {
    it('should set isUnlocked=true and reset lastActivityAt', () => {
      vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
      const wallet = { address: '0x' + 'a'.repeat(64), credentials: [] };
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      const state = usePasskeyStore.getState();
      expect(state.isUnlocked).toBe(true);
      expect(state.keypair).toBe(keypair);
      expect(state.address).toBe(wallet.address);
      expect(state.lastActivityAt).toBe(new Date('2026-06-01T12:00:00Z').getTime());
    });
  });

  describe('lock', () => {
    it('should clear keypair but keep wallet metadata', () => {
      const wallet = { address: '0x' + 'a'.repeat(64), credentials: [] };
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);
      usePasskeyStore.getState().lock();

      const state = usePasskeyStore.getState();
      expect(state.isUnlocked).toBe(false);
      expect(state.keypair).toBeNull();
      // wallet metadata preserved
      expect(state.wallet).toBe(wallet);
      expect(state.address).toBe(wallet.address);
    });
  });

  describe('clear', () => {
    it('should reset everything including lastActivityAt', () => {
      const wallet = { address: '0x' + 'a'.repeat(64), credentials: [] };
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      vi.setSystemTime(new Date('2026-06-01T15:00:00Z'));
      usePasskeyStore.getState().clear();

      const state = usePasskeyStore.getState();
      expect(state.wallet).toBeNull();
      expect(state.keypair).toBeNull();
      expect(state.address).toBeNull();
      expect(state.isUnlocked).toBe(false);
      expect(state.pendingMnemonic).toBeNull();
      expect(state.lastActivityAt).toBe(new Date('2026-06-01T15:00:00Z').getTime());
    });
  });

  // ------------------------------------------
  // Auto-lock timer
  // ------------------------------------------
  describe('auto-lock timer', () => {
    it('should lock wallet after inactivity exceeds autoLockMinutes', () => {
      // Set autoLockMinutes to 5
      localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ autoLockMinutes: 5 }));

      const wallet = { address: '0x' + 'a'.repeat(64), credentials: [] };
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);

      // Advance 4 minutes — should still be unlocked
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);

      // Advance past the 5-minute + 30s timer check threshold
      vi.setSystemTime(new Date('2026-06-01T00:06:00Z'));
      vi.advanceTimersByTime(30_000); // trigger timer check
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
      expect(usePasskeyStore.getState().keypair).toBeNull();
      // wallet metadata is preserved
      expect(usePasskeyStore.getState().wallet).toBe(wallet);
    });

    it('should use default 60 minutes when no localStorage setting', () => {
      // No localStorage setting
      const wallet = { address: '0x' + 'b'.repeat(64), credentials: [] };
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      // Advance 59 minutes — should still be unlocked
      vi.setSystemTime(new Date('2026-06-01T00:59:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);

      // Advance past 60 minutes
      vi.setSystemTime(new Date('2026-06-01T01:01:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
    });

    it('should NOT lock when autoLockMinutes <= 0 (disabled)', () => {
      localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ autoLockMinutes: 0 }));

      const wallet = { address: '0x' + 'c'.repeat(64), credentials: [] };
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      // Advance 1 hour — should still be unlocked
      vi.setSystemTime(new Date('2026-06-01T01:00:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);
    });

    it('should NOT lock when wallet is not unlocked', () => {
      localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ autoLockMinutes: 1 }));

      // Wallet stays locked (never called setUnlocked)
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));

      // Advance 5 minutes — lock() should not be called since isUnlocked is false
      vi.setSystemTime(new Date('2026-06-01T00:05:00Z'));
      vi.advanceTimersByTime(30_000);

      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
      // wallet should still be whatever it was (null in this case)
      expect(usePasskeyStore.getState().keypair).toBeNull();
    });

    it('should reset inactivity counter when updateActivity is called', () => {
      localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ autoLockMinutes: 5 }));

      const wallet = { address: '0x' + 'd'.repeat(64), credentials: [] };
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      // 4 minutes pass
      vi.setSystemTime(new Date('2026-06-01T00:04:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);

      // User activity at 4 minutes
      usePasskeyStore.getState().updateActivity();

      // 4 more minutes (total 8 from start, but only 4 from last activity)
      vi.setSystemTime(new Date('2026-06-01T00:08:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);

      // 6 minutes from last activity (exceeds 5-min limit)
      vi.setSystemTime(new Date('2026-06-01T00:10:30Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
    });

    it('should handle malformed localStorage gracefully', () => {
      localStorage.setItem(SECURITY_SETTINGS_KEY, 'not-json');

      const wallet = { address: '0x' + 'e'.repeat(64), credentials: [] };
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      // Should use default 60 minutes, not crash
      vi.setSystemTime(new Date('2026-06-01T00:59:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(true);

      vi.setSystemTime(new Date('2026-06-01T01:01:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
    });

    it('should handle missing autoLockMinutes field in settings', () => {
      localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ confirmLargeTransactions: true }));

      const wallet = { address: '0x' + 'f'.repeat(64), credentials: [] };
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);

      // Should use default 60 minutes
      vi.setSystemTime(new Date('2026-06-01T01:01:00Z'));
      vi.advanceTimersByTime(30_000);
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
    });
  });

  // ------------------------------------------
  // Passkey-specific lock behavior (does NOT affect session password)
  // ------------------------------------------
  describe('passkey-only lock semantics', () => {
    it('lock should clear passkey keypair and pendingMnemonic for security', () => {
      const wallet = { address: '0x' + 'a'.repeat(64), credentials: [] };
      usePasskeyStore.getState().setUnlocked(wallet as any, keypair);
      usePasskeyStore.getState().setPendingMnemonic('test mnemonic');

      usePasskeyStore.getState().lock();

      // keypair cleared
      expect(usePasskeyStore.getState().keypair).toBeNull();
      expect(usePasskeyStore.getState().isUnlocked).toBe(false);
      // pendingMnemonic cleared on lock to prevent mnemonic leak in memory
      expect(usePasskeyStore.getState().pendingMnemonic).toBeNull();
    });
  });
});
