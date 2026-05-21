/**
 * Analysis cycle — 3-step resumable preset driver.
 *
 * Why this lives next to the other cycle runners (not inside
 * presets/analysis.ts):
 *   presets/analysis.ts owns the prompt templates and the checkpoint
 *   file contract. This file owns the *cycle* — the budget gate per
 *   step, the failure -> checkpoint persistence, and the link to the
 *   shared shutdown flag. Mixing the two would put network /
 *   filesystem side effects into the preset module, which the unit
 *   tests deliberately keep pure.
 *
 * Why we re-check budget at every step:
 *   Each step is a separate Lambda /execute (or /record) call and
 *   deducts from the budget independently. A long-running analysis
 *   that started with enough funds may run dry on step 2 — checkpoint
 *   so step 3 resumes when the user tops up rather than burning the
 *   partial work.
 *
 * Why we early-return without checkpointing when `isShuttingDown` is
 * already true after a step failure:
 *   The fatal that flipped the shutdown flag already logged its
 *   reason. Writing another checkpoint over a stale one would suggest
 *   recoverable state where none exists.
 */

import type { SuiClient } from '@mysten/sui/client';

import { log } from '../logger.js';
import { isShuttingDown } from '../lifecycle.js';
import type { Config } from '../config.js';
import { checkBudget } from '../nasun-ai-client.js';
import {
  analysisPreset,
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from '../presets/analysis.js';
import { runLambdaStep, runRecordStep } from './lambda-runner.js';

export async function runAnalysisCycle(
  client: SuiClient,
  config: Config
): Promise<void> {
  // Load checkpoint if resuming
  let checkpoint = loadCheckpoint();
  const startStep = checkpoint?.step ?? 0;
  const results: string[] = checkpoint?.results ?? [];

  if (checkpoint) {
    log(`Resuming from checkpoint: step ${startStep + 1}/3`);
  }

  const allSteps = analysisPreset.generateSteps();

  for (let i = startStep; i < allSteps.length; i++) {
    // Re-generate step with previous result injected
    const previousResult = i > 0 ? results[i - 1] : undefined;
    const currentSteps = analysisPreset.generateSteps(previousResult);
    const step = currentSteps[i];

    log(`Analysis step ${i + 1}/3: creating on-chain request...`);

    // Check budget before each step
    const budget = await checkBudget(client, config.budgetId);
    if (budget.balance < config.price) {
      log(`[wait] Insufficient balance for step ${i + 1}. Checkpointing and waiting.`);
      saveCheckpoint({ step: i, results, startedAt: checkpoint?.startedAt ?? new Date().toISOString() });
      return;
    }

    // Execute step (lambda or record mode)
    let stepResult: { success: boolean; result?: string };
    if (config.mode === 'record') {
      stepResult = await runRecordStep(client, config, step.prompt, step.category);
    } else {
      stepResult = await runLambdaStep(client, config, step.prompt, step.category);
    }

    if (stepResult.success && stepResult.result) {
      results[i] = stepResult.result;
      log(`Step ${i + 1} completed. Result length: ${stepResult.result.length} chars`);
    } else {
      if (isShuttingDown()) return; // Fatal error already logged
      log(`[error] Step ${i + 1} failed. Checkpointing.`);
      saveCheckpoint({ step: i, results, startedAt: checkpoint?.startedAt ?? new Date().toISOString() });
      return;
    }

    // Save checkpoint after each successful step
    saveCheckpoint({ step: i + 1, results, startedAt: checkpoint?.startedAt ?? new Date().toISOString() });
  }

  // All 3 steps complete
  log('Analysis complete (3/3 steps). Clearing checkpoint.');
  clearCheckpoint();

  // Log final executive summary preview
  const finalResult = results[2];
  if (finalResult) {
    const preview = finalResult.length > 300 ? finalResult.slice(0, 300) + '...' : finalResult;
    log(`Executive summary preview: ${preview}`);
  }
}
