// Single source of truth for shutdown / drain timeouts. Derived values prevent
// drift between PM2 kill_timeout, parent grace, and child backstop.
//
// Worst-case drain duration: SIGTERM mid-BETTING -> finish window -> close_betting
// (up to 5x2s EBettingNotEnded or up to 3x(1.5+3+4.5)s outer LockConflict, not both)
// -> FLYING (max 60s) -> resolve_round (with 3x3s tight retry budget) -> exit.
// Buffer covers RPC jitter and IPC.

const FLYING_MAX_MS = 60_000;
const CLOSE_BETTING_RETRY_MS = 5 * 2_000;
const RESOLVE_TX_BUDGET_MS = 5_000;
const DRAIN_SAFETY_BUFFER_MS = 15_000;

export const CRASH_DRAIN_BUDGET_MS =
  FLYING_MAX_MS + CLOSE_BETTING_RETRY_MS + RESOLVE_TX_BUDGET_MS + DRAIN_SAFETY_BUFFER_MS;
// = 90_000

export const CHILD_BACKSTOP_MS = CRASH_DRAIN_BUDGET_MS;
export const CHILD_HARD_STOP_LEAD_MS = 5_000;
export const PARENT_GRACE_MS = CRASH_DRAIN_BUDGET_MS + 5_000;
export const PM2_KILL_TIMEOUT_MS = CRASH_DRAIN_BUDGET_MS + 15_000;

export const RESOLVE_RETRY_ATTEMPTS = 3;
export const RESOLVE_RETRY_DELAY_MS = 3_000;
