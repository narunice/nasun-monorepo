/**
 * Nasun Wallet Rate Limiting
 * Brute force protection with progressive lockout
 */

import type { UnlockAttemptState } from '../types';
import { LOCKOUT_TIERS, DEFAULT_UNLOCK_ATTEMPT_STATE } from '../types';

const UNLOCK_ATTEMPT_KEY = 'nasun_wallet_unlock_attempts';

/**
 * Load unlock attempt state from localStorage
 */
export function getUnlockAttemptState(): UnlockAttemptState {
  try {
    const stored = localStorage.getItem(UNLOCK_ATTEMPT_KEY);
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
export function saveUnlockAttemptState(state: UnlockAttemptState): void {
  try {
    localStorage.setItem(UNLOCK_ATTEMPT_KEY, JSON.stringify(state));
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
export function isLockedOut(): boolean {
  const state = getUnlockAttemptState();
  if (!state.lockoutEndTime) return false;
  return Date.now() < state.lockoutEndTime;
}

/**
 * Get remaining lockout time in milliseconds
 * @returns Remaining time in ms (0 if not locked out)
 */
export function getLockoutRemainingMs(): number {
  const state = getUnlockAttemptState();
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
export function recordFailedAttempt(): UnlockAttemptState {
  const state = getUnlockAttemptState();
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

  saveUnlockAttemptState(state);
  return state;
}

/**
 * Reset unlock attempts (call on successful unlock)
 */
export function resetUnlockAttempts(): void {
  localStorage.removeItem(UNLOCK_ATTEMPT_KEY);
}

/**
 * Get current lockout info for UI display
 */
export function getLockoutInfo(): {
  isLockedOut: boolean;
  remainingMs: number;
  failedAttempts: number;
} {
  const state = getUnlockAttemptState();
  const remainingMs = getLockoutRemainingMs();

  return {
    isLockedOut: remainingMs > 0,
    remainingMs,
    failedAttempts: state.failedAttempts,
  };
}
