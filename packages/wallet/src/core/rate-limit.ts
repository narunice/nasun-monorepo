/**
 * Nasun Wallet Rate Limiting
 * Brute force protection with progressive lockout
 *
 * Supports multiple independent rate-limit domains via storageKey parameter.
 * Default key is for wallet unlock; BACKUP_RESTORE_ATTEMPT_KEY for backup PIN.
 */

import type { UnlockAttemptState } from '../types';
import { LOCKOUT_TIERS, DEFAULT_UNLOCK_ATTEMPT_STATE } from '../types';

const UNLOCK_ATTEMPT_KEY = 'nasun_wallet_unlock_attempts';

/** Separate rate-limit key for backup restore PIN attempts */
export const BACKUP_RESTORE_ATTEMPT_KEY = 'nasun_backup_restore_attempts';

/**
 * Load unlock attempt state from localStorage
 */
export function getUnlockAttemptState(storageKey: string = UNLOCK_ATTEMPT_KEY): UnlockAttemptState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_UNLOCK_ATTEMPT_STATE, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...DEFAULT_UNLOCK_ATTEMPT_STATE };
}

/**
 * Save unlock attempt state to localStorage
 */
export function saveUnlockAttemptState(state: UnlockAttemptState, storageKey: string = UNLOCK_ATTEMPT_KEY): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (error) {
    // Rate-limit state must persist for security — warn on failure
    console.warn('[RateLimit] Failed to save unlock attempt state:', error);
  }
}

/**
 * Calculate lockout duration based on failed attempts
 * @returns Duration in milliseconds (0 if no lockout)
 */
export function calculateLockoutDuration(failedAttempts: number): number {
  // Find the highest tier that applies
  let duration = 0;
  for (const tier of LOCKOUT_TIERS) {
    if (failedAttempts >= tier.attempts) {
      duration = tier.durationMs;
    }
  }
  return duration;
}

/**
 * Check if currently locked out
 */
export function isLockedOut(storageKey: string = UNLOCK_ATTEMPT_KEY): boolean {
  const state = getUnlockAttemptState(storageKey);
  if (!state.lockoutEndTime) return false;
  return Date.now() < state.lockoutEndTime;
}

/**
 * Get remaining lockout time in milliseconds
 * @returns Remaining time in ms (0 if not locked out)
 */
export function getLockoutRemainingMs(storageKey: string = UNLOCK_ATTEMPT_KEY): number {
  const state = getUnlockAttemptState(storageKey);
  if (!state.lockoutEndTime) return 0;
  const remaining = state.lockoutEndTime - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed unlock attempt
 * Counter keeps incrementing until successful unlock (resetUnlockAttempts).
 * This enables progressive lockout - more failures = longer lockout.
 * @returns Updated state
 */
export function recordFailedAttempt(storageKey: string = UNLOCK_ATTEMPT_KEY): UnlockAttemptState {
  const state = getUnlockAttemptState(storageKey);
  const now = Date.now();

  // Clear expired lockout time (but keep counter for progressive lockout)
  if (state.lockoutEndTime && now >= state.lockoutEndTime) {
    state.lockoutEndTime = null;
  }

  // Increment failed attempts
  state.failedAttempts += 1;
  state.lastAttemptTime = now;

  // Calculate if lockout should be applied
  const lockoutDuration = calculateLockoutDuration(state.failedAttempts);
  if (lockoutDuration > 0) {
    state.lockoutEndTime = now + lockoutDuration;
  }

  saveUnlockAttemptState(state, storageKey);
  return state;
}

/**
 * Reset unlock attempts (call on successful unlock)
 */
export function resetUnlockAttempts(storageKey: string = UNLOCK_ATTEMPT_KEY): void {
  localStorage.removeItem(storageKey);
}

/**
 * Get current lockout info for UI display
 */
export function getLockoutInfo(storageKey: string = UNLOCK_ATTEMPT_KEY): {
  isLockedOut: boolean;
  remainingMs: number;
  failedAttempts: number;
} {
  const state = getUnlockAttemptState(storageKey);
  const remainingMs = getLockoutRemainingMs(storageKey);

  return {
    isLockedOut: remainingMs > 0,
    remainingMs,
    failedAttempts: state.failedAttempts,
  };
}
