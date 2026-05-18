/**
 * Baram Agent Runner — Main loop
 *
 * Runs a preset-selected AI task on a schedule, creating on-chain requests
 * and calling Lambda for AI inference + settlement.
 *
 * Usage: PRESET=research pnpm start
 */

import { createHmac } from 'node:crypto';
import { SuiClient } from '@mysten/sui/client';
import { loadConfig, maskApiKey, type Config, type PresetName } from './config.js';
import { checkBudget, createRequest, sha256Hex, categorizeError } from './nasun-ai-client.js';
import { executeRequest, recordRequest } from './executor-client.js';
import { callLLM } from './llm-client.js';
import { researchPreset } from './presets/research.js';
import { contentPreset } from './presets/content.js';
import {
  analysisPreset,
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
} from './presets/analysis.js';
import {
  runTraderCycle,
  newTraderCycleRuntime,
  type TraderCycleResult,
} from './presets/trader-cycle.js';
import { runAnalystPreset } from './presets/analyst.js';
import { runManualExecution } from './presets/manual-execution.js';
import type { Preset } from './presets/types.js';
import type { WakeContext, WakeOutcome } from './wake-router.js';
import { notifyTraderAER } from './telegram.js';
import { startAerHeartbeatWatchdog } from './aer-heartbeat.js';
import { startWakeServer } from './wake-server.js';
import { IdempotencyStore } from './idempotency.js';

const TRADER_PLACEHOLDER: Preset = {
  name: 'Pado Trader Agent',
  description: 'Autonomous NBTC/NUSDC trading on Pado DeepBook v3',
  generateSteps: () => [{ prompt: '', category: 'ai_inference' }],
};

const PRESETS: Record<PresetName, Preset> = {
  research: researchPreset,
  content: contentPreset,
  analysis: analysisPreset,
  trader: TRADER_PLACEHOLDER,
};

function log(msg: string): void {
  const ts = new Date().toLocaleString('en-US');
  console.log(`[${ts}] ${msg}`);
}

// Returns effectiveIntervalMs from browser config for trader preset, else undefined.
async function runCycle(client: SuiClient, config: Config): Promise<number | undefined> {
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
    shuttingDown = true;
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

// Cross-cycle runtime owned by this process; tests construct their own.
const traderRuntime = newTraderCycleRuntime();

async function runTraderCyclePresetEntry(
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
    shuttingDown = true;
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
async function runHeartbeatFromWake(
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
    shuttingDown = true;
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

async function runSingleStepCycle(
  client: SuiClient,
  config: Config,
  preset: Preset
): Promise<void> {
  const steps = preset.generateSteps();
  const step = steps[0];

  if (config.mode === 'record') {
    await runRecordStep(client, config, step.prompt, step.category);
  } else {
    await runLambdaStep(client, config, step.prompt, step.category);
  }
}

async function runLambdaStep(
  client: SuiClient,
  config: Config,
  prompt: string,
  category: string,
  extras?: import('./executor-client.js').AERExtras,
): Promise<{ success: boolean; result?: string }> {
  // Create on-chain request
  let requestId: number;
  try {
    const req = await createRequest(client, config.keypair, config, prompt, category);
    requestId = req.requestId;
    log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    log(`[error] Request creation failed: ${message}`);
    if (fatal) {
      log('[fatal] Fatal error. Stopping agent.');
      shuttingDown = true;
    }
    return { success: false };
  }

  // Call Lambda /execute
  const result = await executeRequest(
    config.lambdaUrl,
    config.apiKey,
    requestId,
    prompt,
    config.model,
    extras,
  );

  if (result.success) {
    log(`Lambda execution success. Digest: ${result.digest ?? 'n/a'}`);
    if (result.result) {
      const preview = result.result.length > 200
        ? result.result.slice(0, 200) + '...'
        : result.result;
      log(`Result preview: ${preview}`);
    }
  } else {
    log(`[error] Lambda execution failed: ${result.error}. Skipping to next cycle.`);
  }
  return { success: result.success, result: result.result };
}

async function runRecordStep(
  client: SuiClient,
  config: Config,
  prompt: string,
  category: string,
): Promise<{ success: boolean; result?: string }> {
  // 1. Call own LLM first (fail-safe: no budget deduction if this fails)
  let llmResult;
  try {
    log(`Calling LLM: ${config.llmModel}`);
    llmResult = await callLLM(config.llmApiUrl, config.llmApiKey, config.llmModel, prompt);
    log(`LLM response: ${llmResult.content.length} chars, ${llmResult.totalTokens} tokens, ${llmResult.durationMs}ms`);
  } catch (err) {
    log(`[error] LLM call failed: ${err instanceof Error ? err.message : String(err)}. No funds deducted.`);
    return { success: false };
  }

  // 2. Validate result length before on-chain request (avoid orphaned requests)
  const MAX_RESULT_LENGTH = 10_000;
  const MIN_RESULT_LENGTH = 50;
  if (llmResult.content.length > MAX_RESULT_LENGTH) {
    log(`[warn] LLM response too long (${llmResult.content.length} chars). Truncating to ${MAX_RESULT_LENGTH}.`);
    llmResult.content = llmResult.content.slice(0, MAX_RESULT_LENGTH);
  }
  if (llmResult.content.length < MIN_RESULT_LENGTH) {
    log(`[error] LLM response too short (${llmResult.content.length} chars < ${MIN_RESULT_LENGTH}). Skipping.`);
    return { success: false };
  }

  // 3. Generate promptHash as hex string for Lambda verification
  const promptHashHex = sha256Hex(prompt);

  // 5. Create on-chain request (model = llmModel for accurate audit trail)
  let requestId: number;
  try {
    const req = await createRequest(client, config.keypair, config, prompt, category, config.llmModel);
    requestId = req.requestId;
    log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    log(`[error] Request creation failed: ${message}`);
    if (fatal) {
      log('[fatal] Fatal error. Stopping agent.');
      shuttingDown = true;
    }
    return { success: false };
  }

  // 6. Call Lambda /record for settlement
  const result = await recordRequest(
    config.lambdaUrl,
    config.apiKey,
    requestId,
    llmResult.content,
    promptHashHex,
    llmResult.durationMs,
  );

  if (result.success) {
    log(`Record settlement success. Digest: ${result.digest ?? 'n/a'}`);
    const preview = llmResult.content.length > 200
      ? llmResult.content.slice(0, 200) + '...'
      : llmResult.content;
    log(`Result preview: ${preview}`);
  } else {
    log(`[orphan] Record settlement failed for requestId=${requestId}: ${result.error}`);
    log(`[orphan] On-chain request will auto-refund after timeout.`);
  }
  return { success: result.success, result: llmResult.content };
}

async function runAnalysisCycle(
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
      if (shuttingDown) return; // Fatal error already logged
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

// ========== Graceful Shutdown ==========

let shuttingDown = false;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

let wakeShutdownGlobal: (() => Promise<void>) | null = null;

async function performShutdown(): Promise<void> {
  if (wakeShutdownGlobal) {
    try {
      await wakeShutdownGlobal();
    } catch (err) {
      log(`[shutdown] Wake server close error: ${err instanceof Error ? err.message : err}`);
    }
    wakeShutdownGlobal = null;
  }
  log('[shutdown] Agent stopped gracefully.');
  process.exit(0);
}

function handleShutdown(signal: string): void {
  log(`[shutdown] ${signal} received. Finishing current cycle...`);
  shuttingDown = true;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
    void performShutdown();
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// ========== Main ==========

async function main(): Promise<void> {
  console.log('');
  console.log('  Nasun AI Runtime');
  console.log('  Nasun Devnet (Chain ID: 272218f1)');
  console.log('');

  const config = await loadConfig();
  const client = new SuiClient({ url: config.rpcUrl });
  const preset = PRESETS[config.preset];

  log(`Agent: ${config.agentAddress}`);
  log(`Mode: ${config.mode} (${config.mode === 'record' ? 'Model B — self-reported' : 'Model A — Lambda verified'})`);
  log(`Preset: ${preset.name} (${config.preset})`);
  log(`Interval: ${config.intervalMinutes} minutes`);

  startAerHeartbeatWatchdog({
    agentAddress: config.agentAddress,
    intervalMinutes: config.intervalMinutes,
    log,
  });
  log(`Model: ${config.mode === 'record' ? config.llmModel : config.model}`);
  log(`Price per request: ${config.price / 1e6} NUSDC`);
  log(`API Key: ${maskApiKey(config.apiKey)}`);
  if (config.mode === 'record') {
    log(`LLM API: ${config.llmApiUrl}`);
    log(`LLM Key: ${maskApiKey(config.llmApiKey)}`);
  }

  // Plan D D-3: start /wake HTTP server (127.0.0.1) in parallel with the
  // self-scheduling heartbeat loop. Disabled when WAKE_PORT is unset/0.
  if (config.wakePort > 0) {
    const idempotency = new IdempotencyStore();
    const wake = startWakeServer({
      client,
      config,
      idempotency,
      port: config.wakePort,
      logger: (m) => log(m),
      runAnalystCycle: (ctx) => runAnalystPreset(client, config, ctx),
      runHeartbeatCycle: (ctx) => runHeartbeatFromWake(client, config, ctx),
      runManualExecution: (ctx) => runManualExecution(client, config, ctx),
    });
    wakeShutdownGlobal = wake.close;
    log(`Wake endpoint listening on http://127.0.0.1:${config.wakePort}/wake`);

    // Plan D D-2: register this agent's wake endpoint with the chat-server
    // heartbeat every 60s so the Telegram webhook knows where to forward /wake.
    if (config.chatServerBaseUrl) {
      const wakeHttpUrl = `http://127.0.0.1:${config.wakePort}`;
      const heartbeatUrl = `${config.chatServerBaseUrl}/api/nasun-ai/agent/heartbeat`;
      const sendHeartbeat = (): void => {
        const body = JSON.stringify({
          agent: config.agentAddress,
          http_url: wakeHttpUrl,
          budget_id: config.budgetId,
        });
        const hmacSecret = process.env.BARAM_CHAT_SERVER_HMAC_SECRET;
        if (!hmacSecret) return;
        // PR2.A: HMAC binds X-Timestamp + body to prevent replay. Input
        // canonicalization is `${ts}\n${hex(body)}` — chat-server matches.
        const ts = String(Date.now());
        const bodyBuf = Buffer.from(body, 'utf8');
        const hmacInput = Buffer.concat([
          Buffer.from(ts + '\n', 'utf8'),
          Buffer.from(bodyBuf.toString('hex'), 'utf8'),
        ]);
        const hmac = createHmac('sha256', Buffer.from(hmacSecret, 'hex'))
          .update(hmacInput).digest('hex');
        fetch(heartbeatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-HMAC': hmac,
            'X-Timestamp': ts,
            'Connection': 'close',
          },
          body,
          signal: AbortSignal.timeout(15_000),
        }).then((r) => {
          if (!r.ok) log(`[heartbeat] registration rejected: HTTP ${r.status}`);
        }).catch((err: Error) => log(`[heartbeat] registration failed: ${err.message}`));
      };
      sendHeartbeat(); // immediate first ping
      const heartbeatTimer = setInterval(sendHeartbeat, 60_000);
      heartbeatTimer.unref(); // don't block process exit
      log(`[heartbeat] Registering ${wakeHttpUrl} with ${heartbeatUrl} every 60s`);
    }
  }

  // Run first cycle immediately
  const firstIntervalMs = await runCycle(client, config);

  // Schedule subsequent cycles using setTimeout to prevent overlap.
  // overrideIntervalMs: effectiveIntervalMs from browser config (trader preset
  // only). Falls back to config.intervalMs (env / PRESET_DEFAULTS) when absent.
  function scheduleNext(overrideIntervalMs?: number): void {
    if (shuttingDown) {
      log('[shutdown] Agent stopped gracefully.');
      process.exit(0);
    }
    if (config.singleCycle) {
      log('[done] SINGLE_CYCLE=true. Exiting after first cycle.');
      process.exit(0);
    }
    const nextMs = overrideIntervalMs ?? config.intervalMs;
    const nextMin = Math.round(nextMs / 60_000);
    log(`Next cycle in ${nextMin} minutes.`);
    pendingTimer = setTimeout(async () => {
      pendingTimer = null;
      if (shuttingDown) {
        log('[shutdown] Agent stopped gracefully.');
        process.exit(0);
      }
      let nextIntervalMs: number | undefined;
      try {
        nextIntervalMs = await runCycle(client, config);
      } catch (err) {
        log(`[error] Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      }
      scheduleNext(nextIntervalMs);
    }, nextMs);
  }

  scheduleNext(firstIntervalMs);
}

main().catch((err) => {
  log(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
