/**
 * Baram Agent Runner — Main loop
 *
 * Runs a preset-selected AI task on a schedule, creating on-chain requests
 * and calling Lambda for AI inference + settlement.
 *
 * Usage: PRESET=research pnpm start
 */

import { SuiClient } from '@mysten/sui/client';
import { loadConfig, type PresetName } from './config.js';
import { checkBudget, createRequest, categorizeError } from './baram-client.js';
import { executeRequest } from './executor-client.js';
import { researchPreset } from './presets/research.js';
import { contentPreset } from './presets/content.js';
import {
  analysisPreset,
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from './presets/analysis.js';
import type { Preset } from './presets/types.js';

const PRESETS: Record<PresetName, Preset> = {
  research: researchPreset,
  content: contentPreset,
  analysis: analysisPreset,
};

function log(msg: string): void {
  const ts = new Date().toLocaleString('en-US');
  console.log(`[${ts}] ${msg}`);
}

async function runCycle(client: SuiClient, config: ReturnType<typeof loadConfig>): Promise<void> {
  const preset = PRESETS[config.preset];
  log(`--- Cycle start: ${preset.name} ---`);

  // 1. Check budget
  let budget;
  try {
    budget = await checkBudget(client, config.budgetId);
  } catch (err) {
    log(`[error] Budget check failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (!budget.isActive) {
    log('[fatal] Budget is inactive. Stopping agent.');
    shuttingDown = true;
    return;
  }

  if (budget.balance < config.price) {
    log(`[wait] Insufficient balance: ${budget.balance} < ${config.price}. Will retry next cycle.`);
    return;
  }

  log(`Budget: ${budget.balance} balance, ${budget.totalSpent} spent, ${budget.requestCount} requests`);

  // 2. Generate steps
  if (config.preset === 'analysis') {
    await runAnalysisCycle(client, config);
  } else {
    await runSingleStepCycle(client, config, preset);
  }
}

async function runSingleStepCycle(
  client: SuiClient,
  config: ReturnType<typeof loadConfig>,
  preset: Preset
): Promise<void> {
  const steps = preset.generateSteps();
  const step = steps[0];

  // 3. Create on-chain request
  let requestId: number;
  try {
    requestId = await createRequest(client, config.keypair, config, step.prompt, step.category);
    log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    log(`[error] Request creation failed: ${message}`);
    if (fatal) {
      log('[fatal] Fatal error. Stopping agent.');
      shuttingDown = true;
    }
    return;
  }

  // 4. Call Lambda /execute
  const result = await executeRequest(
    config.lambdaUrl,
    config.apiKey,
    requestId,
    step.prompt,
    config.model
  );

  if (result.success) {
    log(`Lambda execution success. Digest: ${result.digest ?? 'n/a'}`);
    if (result.result) {
      // Show first 200 chars of result
      const preview = result.result.length > 200
        ? result.result.slice(0, 200) + '...'
        : result.result;
      log(`Result preview: ${preview}`);
    }
  } else {
    log(`[error] Lambda execution failed: ${result.error}. Skipping to next cycle.`);
  }
}

async function runAnalysisCycle(
  client: SuiClient,
  config: ReturnType<typeof loadConfig>
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

    // Create on-chain request
    let requestId: number;
    try {
      requestId = await createRequest(client, config.keypair, config, step.prompt, step.category);
      log(`Step ${i + 1} request created: requestId=${requestId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const { message, fatal } = categorizeError(msg);
      log(`[error] Step ${i + 1} failed: ${message}`);
      if (fatal) {
        log('[fatal] Fatal error. Stopping agent.');
        shuttingDown = true;
      }
      // Non-fatal: checkpoint and retry next cycle
      saveCheckpoint({ step: i, results, startedAt: checkpoint?.startedAt ?? new Date().toISOString() });
      return;
    }

    // Call Lambda
    const result = await executeRequest(
      config.lambdaUrl,
      config.apiKey,
      requestId,
      step.prompt,
      config.model
    );

    if (result.success && result.result) {
      results[i] = result.result;
      log(`Step ${i + 1} completed. Result length: ${result.result.length} chars`);
    } else {
      log(`[error] Step ${i + 1} Lambda failed: ${result.error}. Checkpointing.`);
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

// ========== Graceful Shutdown ==========

let shuttingDown = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

function handleShutdown(signal: string): void {
  log(`[shutdown] ${signal} received. Finishing current cycle...`);
  shuttingDown = true;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    log('[shutdown] Agent stopped gracefully.');
    process.exit(0);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// ========== Main ==========

async function main(): Promise<void> {
  console.log('');
  console.log('  Baram Agent Runner');
  console.log('  Nasun Devnet (Chain ID: 272218f1)');
  console.log('');

  const config = loadConfig();
  const client = new SuiClient({ url: config.rpcUrl });
  const preset = PRESETS[config.preset];

  log(`Agent: ${config.agentAddress}`);
  log(`Preset: ${preset.name} (${config.preset})`);
  log(`Interval: ${config.intervalMinutes} minutes`);
  log(`Model: ${config.model}`);
  log(`Price per request: ${config.price / 1e6} NUSDC`);

  // Run first cycle immediately
  await runCycle(client, config);

  // Schedule subsequent cycles using setTimeout to prevent overlap
  function scheduleNext(): void {
    if (shuttingDown) {
      log('[shutdown] Agent stopped gracefully.');
      process.exit(0);
    }
    log(`Next cycle in ${config.intervalMinutes} minutes.`);
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      if (shuttingDown) {
        log('[shutdown] Agent stopped gracefully.');
        process.exit(0);
      }
      try {
        await runCycle(client, config);
      } catch (err) {
        log(`[error] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }
      scheduleNext();
    }, config.intervalMs);
  }

  scheduleNext();
}

main().catch((err) => {
  log(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
