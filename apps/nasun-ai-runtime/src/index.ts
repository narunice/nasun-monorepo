/**
 * Nasun AI Runtime — process entry point.
 *
 * Owns:
 *   - Startup banner + config load + SuiClient construction
 *   - Per-cycle self-scheduling loop (`scheduleNext`)
 *   - Wake HTTP server start (when WAKE_PORT > 0)
 *   - chat-server registration heartbeat
 *   - SIGINT/SIGTERM handlers and the final shutdown sequence
 *
 * Cycle logic itself lives in ./cycles/* so each preset's behaviour
 * can be tested without standing up a Sui RPC or a wake server. The
 * shared "are we shutting down?" flag is in ./lifecycle.ts so cycle
 * runners can request shutdown without circular imports back to here.
 *
 * Why scheduleNext uses setTimeout (not setInterval):
 *   A cycle that runs longer than the configured interval must not
 *   overlap with the next one (LLM /infer + on-chain settle can spike
 *   to tens of seconds). setTimeout re-arms after the prior cycle
 *   resolves, guaranteeing strict serialisation.
 *
 * Why we exit on shutdown via process.exit(0) instead of clearing the
 * timer and returning:
 *   PM2 only records a "stopped" state when the process actually
 *   exits. A long-running async tail (e.g. final telegram notify)
 *   would otherwise keep the process alive and confuse operators
 *   inspecting `pm2 status`.
 */

import { SuiClient } from '@mysten/sui/client';

import { loadConfig, maskApiKey } from './config.js';
import { log } from './logger.js';
import { isShuttingDown, requestShutdown } from './lifecycle.js';
import { startAerHeartbeatWatchdog } from './aer-heartbeat.js';
import { startWakeServer } from './wake-server.js';
import { IdempotencyStore } from './idempotency.js';
import { startChatServerHeartbeat } from './chat-server-heartbeat.js';
import { PRESETS } from './cycles/registry.js';
import { runCycle } from './cycles/run-cycle.js';
import { runHeartbeatFromWake } from './cycles/trader-runner.js';
import { runAnalystPreset } from './presets/analyst.js';
import { runManualExecution } from './presets/manual-execution.js';

// ========== Graceful Shutdown ==========

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
  requestShutdown();
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
      startChatServerHeartbeat({
        chatServerBaseUrl: config.chatServerBaseUrl,
        agentAddress: config.agentAddress,
        budgetId: config.budgetId,
        wakePort: config.wakePort,
      });
    }
  }

  // Run first cycle immediately
  const firstIntervalMs = await runCycle(client, config);

  // Schedule subsequent cycles using setTimeout to prevent overlap.
  // overrideIntervalMs: effectiveIntervalMs from browser config (trader preset
  // only). Falls back to config.intervalMs (env / PRESET_DEFAULTS) when absent.
  function scheduleNext(overrideIntervalMs?: number): void {
    if (isShuttingDown()) {
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
      if (isShuttingDown()) {
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
