/**
 * Trader cycle driver — the two entry points used by index.ts.
 *
 * Why two entry points share one `traderRuntime` (Plan D D-3):
 *   - `runTraderCyclePresetEntry` is called from the autonomous
 *     heartbeat loop (every INTERVAL_MINUTES).
 *   - `runHeartbeatFromWake` is called from /wake when chat-server
 *     forwards a manual trigger.
 *   Both must share the same intent-chain state and recent-trades
 *   memory so a manual /wake does not reset the LLM's context.
 *   `newTraderCycleRuntime()` is intentionally constructed once at
 *   module load — tests instantiate their own runtime via DI.
 *
 * Why the autonomous path returns `effectiveIntervalMs` while the wake
 * path returns a `WakeOutcome`:
 *   The autonomous scheduler honours per-cycle interval overrides from
 *   browser-side config (lets users tighten or loosen cadence without
 *   a restart). The wake path needs a structured outcome for the
 *   idempotency store so a replayed job_id surfaces the prior result
 *   instead of re-running the cycle.
 *
 * Why a `pending_lock` result still maps to `ok: true` for /wake:
 *   The lock means a manual proposal is already in flight. From the
 *   caller's POV that is a successful no-op (skipped), not a failure.
 *   Marking it `ok: false` would make chat-server retry and stack up
 *   more proposals on a user who already has one open.
 */

import type { SuiClient } from '@mysten/sui/client';

import { log } from '../logger.js';
import { requestShutdown } from '../lifecycle.js';
import type { Config } from '../config.js';
import {
  runTraderCycle,
  newTraderCycleRuntime,
  type TraderCycleResult,
} from '../presets/trader-cycle.js';
import { notifyTraderAER } from '../telegram.js';
import type { WakeContext, WakeOutcome } from '../wake-router.js';

// Cross-cycle runtime owned by this process; tests construct their own.
const traderRuntime = newTraderCycleRuntime();

export async function runTraderCyclePresetEntry(
  client: SuiClient,
  config: Config,
): Promise<number | undefined> {
  let result: TraderCycleResult;
  try {
    result = await runTraderCycle(client, config, traderRuntime);
  } catch (err) {
    log(`[trader] Unexpected cycle error: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
  if (result.fatal) {
    requestShutdown();
  }
  if (result.outcome === 'succeeded' && result.decision) {
    const { telegramBotToken, telegramChatId } = config;
    if (telegramBotToken && telegramChatId) {
      await notifyTraderAER(telegramBotToken, telegramChatId, {
        action: result.decision.action,
        sizeNUSDC: result.decision.sizeNUSDC,
        reason: result.decision.reason,
        txDigest: result.txDigest,
        agentAddress: config.agentAddress,
        riskGate: result.decision.riskGate,
      });
    }
  }
  return result.effectiveIntervalMs;
}

// External heartbeat trigger (e.g., Telegram /wake-now command) — runs the
// same trader cycle as the autonomous heartbeat but returns a WakeOutcome
// for the idempotency store. Kept separate from the setTimeout loop so the
// two paths can be driven independently in tests.
export async function runHeartbeatFromWake(
  client: SuiClient,
  config: Config,
  _ctx: WakeContext,
): Promise<WakeOutcome> {
  let result: TraderCycleResult;
  try {
    result = await runTraderCycle(client, config, traderRuntime);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    log(`[heartbeat-wake] Unexpected cycle error: ${reason}`);
    return { ok: false, status: 'rejected', reason };
  }
  if (result.fatal) {
    requestShutdown();
  }
  const succeeded = result.outcome === 'succeeded' || result.outcome === 'pending_lock';
  const summary = result.decision
    ? `${result.decision.action} ~${result.decision.sizeNUSDC} NUSDC: ${result.decision.reason}`
    : result.outcome;
  return {
    ok: succeeded,
    status: result.outcome === 'pending_lock' ? 'skipped' : 'processed',
    reason: result.outcome,
    aerDigest: result.txDigest,
    summary,
  };
}
