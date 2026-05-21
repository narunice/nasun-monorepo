/**
 * Cycle dispatcher — the top-level "what does one tick of this agent do?"
 *
 * Why the trader path is short-circuited *before* the budget check:
 *   The trader cycle owns its own budget check (it has to: the trader
 *   may decide HOLD and abort before any /infer call, in which case
 *   the budget should not be flagged as "Insufficient"). Doing a
 *   second budget check here would either log a spurious wait or
 *   diverge the two paths when on-chain price changes mid-cycle.
 *
 * Why an inactive budget flips the global shutdown flag instead of
 * just returning:
 *   "Inactive" means the on-chain budget object has been closed by
 *   the user — there is no way for this agent to do useful work
 *   without operator intervention. Continuing to poll wastes RPC and
 *   produces a noisy log. The scheduler in index.ts catches the flag
 *   and exits cleanly so PM2 records the stop.
 */

import type { SuiClient } from '@mysten/sui/client';

import { log } from '../logger.js';
import { requestShutdown } from '../lifecycle.js';
import type { Config } from '../config.js';
import { checkBudget } from '../nasun-ai-client.js';
import { PRESETS } from './registry.js';
import { runTraderCyclePresetEntry } from './trader-runner.js';
import { runSingleStepCycle } from './lambda-runner.js';
import { runAnalysisCycle } from './analysis-runner.js';

// Returns effectiveIntervalMs from browser config for trader preset, else undefined.
export async function runCycle(client: SuiClient, config: Config): Promise<number | undefined> {
  const preset = PRESETS[config.preset];
  log(`--- Cycle start: ${preset.name} ---`);

  if (config.preset === 'trader') {
    // Trader cycle handles its own budget check internally.
    return runTraderCyclePresetEntry(client, config);
  }

  // 1. Check budget (non-trader presets)
  let budget;
  try {
    budget = await checkBudget(client, config.budgetId);
  } catch (err) {
    log(`[error] Budget check failed: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }

  if (!budget.isActive) {
    log('[fatal] Budget is inactive. Stopping agent.');
    requestShutdown();
    return undefined;
  }

  if (budget.balance < config.price) {
    log(`[wait] Insufficient balance: ${budget.balance} < ${config.price}. Will retry next cycle.`);
    return undefined;
  }

  log(`Budget: ${budget.balance} balance, ${budget.totalSpent} spent, ${budget.requestCount} requests`);

  // 2. Generate steps
  if (config.preset === 'analysis') {
    await runAnalysisCycle(client, config);
  } else {
    await runSingleStepCycle(client, config, preset);
  }
  return undefined;
}
