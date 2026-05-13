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
import { ACTIVE_WAKE_TRIGGERS, type WakeTrigger } from '@nasun/baram-sdk';
import type { Config } from './config.js';
import type { IdempotencyStore } from './idempotency.js';

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
}

export interface WakeRouterDeps {
  client: SuiClient;
  config: Config;
  idempotency: IdempotencyStore;
  /** Execute an analyst cognition cycle (D-4). Optional during D-3 stub. */
  runAnalystCycle?: (ctx: WakeContext) => Promise<WakeOutcome>;
  /** Resume a confirmed proposal into execution AER (D-5). */
  runManualExecution?: (ctx: WakeContext) => Promise<WakeOutcome>;
  /** Run an autonomous heartbeat cycle (D-3 wires existing trader). */
  runHeartbeatCycle?: (ctx: WakeContext) => Promise<WakeOutcome>;
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
  switch (ctx.triggerType) {
    case 'heartbeat':
      if (!deps.runHeartbeatCycle) {
        return { ok: true, status: 'queued', reason: 'heartbeat_handler_not_wired', intentId: ctx.intentId };
      }
      return deps.runHeartbeatCycle(ctx);
    case 'user_message':
      if (!deps.runAnalystCycle) {
        return { ok: true, status: 'queued', reason: 'analyst_handler_not_wired', intentId: ctx.intentId };
      }
      return deps.runAnalystCycle(ctx);
    case 'manual':
      if (!deps.runManualExecution) {
        return { ok: true, status: 'queued', reason: 'manual_handler_not_wired', intentId: ctx.intentId };
      }
      return deps.runManualExecution(ctx);
    default:
      return { ok: false, status: 'rejected', reason: 'unknown_trigger' };
  }
}
