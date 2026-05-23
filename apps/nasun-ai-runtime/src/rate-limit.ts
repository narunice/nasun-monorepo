/**
 * In-memory sliding-window rate limiter for user_message wake events.
 *
 * Why this exists:
 *   The general-chat path (`presets/chat.ts`) bypasses Budget/AER, which
 *   are otherwise the natural cost-based throttles for `user_message`
 *   wakes. Without a limiter, a single misbehaving session could drain
 *   shared free-tier LLM quota (Groq/Cerebras typically ~30 req/min)
 *   for every other tester.
 *
 *   Trading-intent messages (analyst preset) also go through the same
 *   LLM pool, so we count them too -- the limiter is the only common
 *   chokepoint upstream of `/infer`.
 *
 * Defaults (tuned for ~8 concurrent testers on rotating free APIs):
 *   per-sid: 3/min, 20/hour, 80/day
 *   global:  24/min, 480/hour, 3200/day
 *
 * 2026-05-23 update: trading-intent wakes (analyst preset) are NO LONGER
 * counted here; on-chain Budget already throttles them by deducting
 * per-request payment. Only the chat preset path consumes this limiter,
 * so the budget is sized for chit-chat traffic on the free LLM pool
 * (Groq single-key safety margin: 8 users x 3/min = 24/min < 30/min).
 *
 * The limiter is process-local on purpose. nasun-ai-runtime is spawned
 * one-per-agent, so per-sid limits are effectively per-(agent, session).
 * Global limits cap the LLM call rate from a single agent process.
 *
 * Survives crashes by intentionally NOT persisting: a restart should
 * fully reset the window rather than carry over stale counters.
 */

export type RateLimitWindow = 'minute' | 'hour' | 'day';

export interface RateLimitConfig {
  perSidPerMinute: number;
  perSidPerHour: number;
  perSidPerDay: number;
  globalPerMinute: number;
  globalPerHour: number;
  globalPerDay: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  perSidPerMinute: 3,
  perSidPerHour: 20,
  perSidPerDay: 80,
  globalPerMinute: 24,
  globalPerHour: 480,
  globalPerDay: 3200,
};

export interface RateLimitDecision {
  allowed: boolean;
  /** Window that tripped, if denied. */
  scope?: 'per_sid' | 'global';
  window?: RateLimitWindow;
  /** Seconds until the oldest hit in the offending window expires. */
  retryAfterSec?: number;
  /** Compact human-readable reason for logs/responses. */
  reason?: string;
}

interface WindowState {
  hits: number[];
}

const WINDOW_MS: Record<RateLimitWindow, number> = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
};

export class RateLimiter {
  private readonly perSid = new Map<string, Record<RateLimitWindow, WindowState>>();
  private readonly global: Record<RateLimitWindow, WindowState> = {
    minute: { hits: [] },
    hour: { hits: [] },
    day: { hits: [] },
  };

  constructor(private readonly cfg: RateLimitConfig = DEFAULT_RATE_LIMITS) {}

  /**
   * Check whether a hit for `sid` would exceed any window. Does not
   * mutate state -- call `consume` to record an allowed hit.
   *
   * Splitting check + consume lets callers log the decision before
   * committing, and avoids a leak if downstream wiring later wants to
   * bail out between the limiter and the actual LLM call.
   */
  check(sid: string, now = Date.now()): RateLimitDecision {
    this.prune(now);

    const perSidState = this.perSid.get(sid);
    const perSidChecks: Array<[RateLimitWindow, number]> = [
      ['minute', this.cfg.perSidPerMinute],
      ['hour', this.cfg.perSidPerHour],
      ['day', this.cfg.perSidPerDay],
    ];
    for (const [w, limit] of perSidChecks) {
      const count = perSidState?.[w].hits.length ?? 0;
      if (count >= limit) {
        const oldest = perSidState?.[w].hits[0] ?? now;
        const retryMs = oldest + WINDOW_MS[w] - now;
        return {
          allowed: false,
          scope: 'per_sid',
          window: w,
          retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)),
          reason: `per_sid_${w}: ${count}/${limit}`,
        };
      }
    }

    const globalChecks: Array<[RateLimitWindow, number]> = [
      ['minute', this.cfg.globalPerMinute],
      ['hour', this.cfg.globalPerHour],
      ['day', this.cfg.globalPerDay],
    ];
    for (const [w, limit] of globalChecks) {
      const count = this.global[w].hits.length;
      if (count >= limit) {
        const oldest = this.global[w].hits[0] ?? now;
        const retryMs = oldest + WINDOW_MS[w] - now;
        return {
          allowed: false,
          scope: 'global',
          window: w,
          retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)),
          reason: `global_${w}: ${count}/${limit}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record a hit for `sid` against all windows. Callers should call this
   * AFTER a successful `check`. Idempotency is intentionally not enforced
   * here -- the caller (wake-router) already dedups by `job_id`.
   */
  consume(sid: string, now = Date.now()): void {
    let state = this.perSid.get(sid);
    if (!state) {
      state = {
        minute: { hits: [] },
        hour: { hits: [] },
        day: { hits: [] },
      };
      this.perSid.set(sid, state);
    }
    state.minute.hits.push(now);
    state.hour.hits.push(now);
    state.day.hits.push(now);

    this.global.minute.hits.push(now);
    this.global.hour.hits.push(now);
    this.global.day.hits.push(now);
  }

  /**
   * Combined check + consume. Returns the decision; mutates only on
   * allowed=true. Most callers should use this.
   */
  checkAndConsume(sid: string, now = Date.now()): RateLimitDecision {
    const decision = this.check(sid, now);
    if (decision.allowed) this.consume(sid, now);
    return decision;
  }

  private prune(now: number): void {
    const cutoffs: Record<RateLimitWindow, number> = {
      minute: now - WINDOW_MS.minute,
      hour: now - WINDOW_MS.hour,
      day: now - WINDOW_MS.day,
    };
    for (const w of Object.keys(cutoffs) as RateLimitWindow[]) {
      this.global[w].hits = this.global[w].hits.filter((t) => t > cutoffs[w]);
    }
    for (const [sid, state] of this.perSid.entries()) {
      for (const w of Object.keys(cutoffs) as RateLimitWindow[]) {
        state[w].hits = state[w].hits.filter((t) => t > cutoffs[w]);
      }
      // Drop the entry entirely when all windows are empty; keeps the
      // map from growing unbounded across thousands of unique sids.
      if (
        state.minute.hits.length === 0 &&
        state.hour.hits.length === 0 &&
        state.day.hits.length === 0
      ) {
        this.perSid.delete(sid);
      }
    }
  }
}
