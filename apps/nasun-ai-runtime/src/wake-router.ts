/**
 * Wake router — dispatches authenticated `/wake` requests by `trigger_type`.
 *
 * Plan D Foundation §결정 5 + Plan D §A5 mapping:
 *   - heartbeat:    autonomous trader cycle (existing path)
 *   - user_message: cognition-only analyst cycle (D-4)
 *   - manual:       resume confirmed proposal → execution AER (D-5)
 *
 * The router is auth-agnostic: HMAC + JWT verification happens in
 * `wake-server.ts` middleware before this function runs.
 */
import type { SuiClient } from '@mysten/sui/client';
import { ACTIVE_WAKE_TRIGGERS, type WakeTrigger, type Proposal } from '@nasun/baram-sdk';
import type { Config } from './config.js';
import type { IdempotencyStore } from './idempotency.js';
import { classifyIntent } from './presets/intent-classifier.js';
import { RateLimiter } from './rate-limit.js';

export interface WakeContext {
  jobId: string;
  triggerType: WakeTrigger;
  intentId: string;
  parentIntentId?: string;
  sid: string;
  message?: string;
  nowMs: number;
}

export interface WakeOutcome {
  ok: boolean;
  status: 'queued' | 'processed' | 'skipped' | 'rejected';
  reason?: string;
  intentId?: string;
  aerDigest?: string;
  summary?: string;
  /** Present when the analyst cycle produced a trade proposal (BUY/SELL).
   *  Chat-server uses this to send an inline keyboard and store the artifact. */
  proposal?: Proposal;
}

export interface WakeRouterDeps {
  client: SuiClient;
  config: Config;
  idempotency: IdempotencyStore;
  /** Execute an analyst cognition cycle (D-4). Optional during D-3 stub. */
  runAnalystCycle?: (ctx: WakeContext) => Promise<WakeOutcome>;
  /** Free-form LLM chat for non-trading user_message (2026-05-23). When
   *  unset, every user_message falls through to runAnalystCycle, which
   *  matches pre-chat behaviour. */
  runChatCycle?: (ctx: WakeContext) => Promise<WakeOutcome>;
  /** Resume a confirmed proposal into execution AER (D-5). */
  runManualExecution?: (ctx: WakeContext) => Promise<WakeOutcome>;
  /** Run an autonomous heartbeat cycle (D-3 wires existing trader). */
  runHeartbeatCycle?: (ctx: WakeContext) => Promise<WakeOutcome>;
  /** Per-sid + global rate limiter shared between analyst and chat. Both
   *  paths consume the same free-tier LLM pool, so they share one window.
   *  When absent, rate limiting is skipped (used in unit tests). */
  rateLimiter?: RateLimiter;
  /** Optional log sink. Defaults to console.log via a no-op shim when
   *  omitted -- keeps the router pure for tests. */
  log?: (msg: string) => void;
}

/**
 * Single entry point. Returns the prior outcome if `job_id` has already been
 * processed, else dispatches to the trigger-specific handler and persists
 * the outcome before returning.
 */
export async function dispatchWake(
  ctx: WakeContext,
  deps: WakeRouterDeps,
): Promise<WakeOutcome> {
  if (!ACTIVE_WAKE_TRIGGERS.has(ctx.triggerType)) {
    return { ok: false, status: 'rejected', reason: `inactive_trigger:${ctx.triggerType}` };
  }

  const prior = deps.idempotency.get(ctx.jobId);
  if (prior) {
    const prev = (prior.outcome ?? {}) as WakeOutcome;
    return { ...prev, status: 'processed', reason: 'idempotent_replay' };
  }

  let outcome: WakeOutcome;
  try {
    outcome = await runHandler(ctx, deps);
  } catch (err) {
    outcome = {
      ok: false,
      status: 'rejected',
      reason: `handler_error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  deps.idempotency.put(ctx.jobId, deps.config.agentAddress, outcome);
  return outcome;
}

async function runHandler(ctx: WakeContext, deps: WakeRouterDeps): Promise<WakeOutcome> {
  const log = deps.log ?? (() => {});
  switch (ctx.triggerType) {
    case 'heartbeat':
      if (!deps.runHeartbeatCycle) {
        return { ok: true, status: 'queued', reason: 'heartbeat_handler_not_wired', intentId: ctx.intentId };
      }
      return deps.runHeartbeatCycle(ctx);
    case 'user_message': {
      // Classify first so trading-intent wakes never touch the chat
      // rate-limiter. Trading is already throttled on-chain by Budget
      // deduction; double-throttling here would let a chat burst block
      // a legitimate BUY/SELL, which is the worse failure mode.
      const intent = classifyIntent(ctx.message ?? '');
      log(
        `[wake-router] user_message intent=${intent.intent} ` +
        `rule=${intent.matchedRule ?? 'n/a'} sid=${ctx.sid.slice(0, 8)}...`,
      );

      if (intent.intent === 'chat' && deps.runChatCycle) {
        // Chat-only rate limit: chat uses the free LLM pool which has
        // shared per-minute quota. Returning ok:true + summary so the
        // user sees why nothing happened (instead of a silent skip).
        if (deps.rateLimiter) {
          const decision = deps.rateLimiter.checkAndConsume(ctx.sid, ctx.nowMs);
          if (!decision.allowed) {
            log(
              `[wake-router] rate-limited chat sid=${ctx.sid.slice(0, 8)}... ` +
              `${decision.reason}`,
            );
            return {
              ok: true,
              status: 'skipped',
              intentId: ctx.intentId,
              reason: `rate_limited:${decision.reason ?? 'unknown'}`,
              summary:
                `You're sending messages a bit fast. Try again in ` +
                `${decision.retryAfterSec ?? 60}s. ` +
                `(Trade commands like "BUY"/"SELL" are not rate-limited.)`,
            };
          }
        }
        return deps.runChatCycle(ctx);
      }

      // Trading intent OR no chat handler wired: fall through to analyst.
      // No rate-limit applied -- Budget handles it.
      if (!deps.runAnalystCycle) {
        return { ok: true, status: 'queued', reason: 'analyst_handler_not_wired', intentId: ctx.intentId };
      }
      return deps.runAnalystCycle(ctx);
    }
    case 'manual':
      if (!deps.runManualExecution) {
        return { ok: true, status: 'queued', reason: 'manual_handler_not_wired', intentId: ctx.intentId };
      }
      return deps.runManualExecution(ctx);
    default:
      return { ok: false, status: 'rejected', reason: 'unknown_trigger' };
  }
}
