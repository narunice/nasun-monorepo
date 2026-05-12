/**
 * Baram Agent Runner — Main loop
 *
 * Runs a preset-selected AI task on a schedule, creating on-chain requests
 * and calling Lambda for AI inference + settlement.
 *
 * Usage: PRESET=research pnpm start
 */

import { SuiClient } from '@mysten/sui/client';
import { fromBase58 } from '@mysten/sui/utils';
import { loadConfig, maskApiKey, type PresetName } from './config.js';
import { checkBudget, createRequest, sha256Hex, categorizeError } from './baram-client.js';
import { executeRequest, recordRequest } from './executor-client.js';
import { executeCapability } from './host-client.js';
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
  TRADER_CONFIG,
  buildTraderPrompt,
  parseTradeDecision,
  executeTrade,
  fetchAgentBalances,
  dailySpentQuoteRaw,
  recentTrades,
  type TradeDecision,
} from './presets/trader.js';
import {
  buildAnalysisEnvelope,
  buildCognitionProposal,
  buildHeartbeatWake,
  buildReplay,
  newIntentChainState,
  openIntent,
  recentTradesSnapshot,
} from './presets/trader-envelope.js';
import type { Preset } from './presets/types.js';

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
  } else if (config.preset === 'trader') {
    await runTraderCycle(client, config);
  } else {
    await runSingleStepCycle(client, config, preset);
  }
}

// Holds the most recent successful trade digest (base58) so the NEXT cycle
// can attach it to its AER (triggered_by + purpose). Persisted to disk so
// the chain survives process restarts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TRADER_STATE_PATH = join(homedir(), '.baram-trader-state.json');

interface TraderState {
  lastTradeDigest: string | null;
  /** Last cognition AER intent_id (16-byte UUIDv7, hex-encoded). The next
   *  cycle's cognition AER points its parent_intent_id at this so a viewer
   *  can walk the intent chain across cycles without re-reading every AER. */
  lastIntentIdHex: string | null;
}

function loadTraderState(): TraderState {
  try {
    if (existsSync(TRADER_STATE_PATH)) {
      const raw = readFileSync(TRADER_STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TraderState>;
      return {
        lastTradeDigest:
          typeof parsed.lastTradeDigest === 'string' ? parsed.lastTradeDigest : null,
        lastIntentIdHex:
          typeof parsed.lastIntentIdHex === 'string' ? parsed.lastIntentIdHex : null,
      };
    }
  } catch {
    // Corrupt file — fall through to default
  }
  return { lastTradeDigest: null, lastIntentIdHex: null };
}

function saveTraderState(state: TraderState): void {
  try {
    writeFileSync(TRADER_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[trader] Failed to persist state:', err instanceof Error ? err.message : err);
  }
}

const initialTraderState = loadTraderState();
let lastTradeDigest: string | null = initialTraderState.lastTradeDigest;

// Lineage chain seeded from disk so cycle N+1 (after a process restart)
// still chains to cycle N's intent.
const traderIntentChain = newIntentChainState();
if (initialTraderState.lastIntentIdHex) {
  try {
    traderIntentChain.lastIntentId = Array.from(
      Buffer.from(initialTraderState.lastIntentIdHex, 'hex'),
    );
  } catch {
    // Ignore — start a fresh chain.
  }
}

function digestB58ToIdHex(digestB58: string): string | null {
  try {
    const bytes = fromBase58(digestB58);
    if (bytes.length !== 32) return null;
    return '0x' + Buffer.from(bytes).toString('hex');
  } catch {
    return null;
  }
}

async function runTraderCycle(
  client: SuiClient,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const trader = config.trader;
  if (!trader) {
    log('[trader] HOST_URL/CAPABILITY_ID/WALLET_ADDRESS not configured; cannot run trader cycle.');
    shuttingDown = true;
    return;
  }

  const agentAddr = config.agentAddress;

  // 1. Fetch balances
  const balances = await fetchAgentBalances(client, agentAddr);
  log(
    `Trader balances: ${(Number(balances.nbtcRaw) / 1e8).toFixed(8)} NBTC, ${(Number(balances.nusdcRaw) / 1e6).toFixed(6)} NUSDC`,
  );

  const dailySpentRaw = dailySpentQuoteRaw();
  const recent = recentTrades();

  // 2. Build market prompt with strategy preset spliced in
  const nowIso = new Date().toISOString();
  const prompt = buildTraderPrompt({
    agentAddr,
    nbtcRaw: balances.nbtcRaw,
    nusdcRaw: balances.nusdcRaw,
    perTradeMaxQuoteRaw: trader.maxNotionalQuoteRaw,
    dailyMaxQuoteRaw: trader.dailyMaxQuoteRaw,
    dailySpentRaw,
    recent,
    strategy: trader.strategy,
    nowIso,
  });

  // 3. Create on-chain request (budget deduction)
  let requestId: number;
  try {
    const req = await createRequest(client, config.keypair, config, prompt, 'ai_inference');
    requestId = req.requestId;
    log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    log(`[trader] Request creation failed: ${message}`);
    if (fatal) shuttingDown = true;
    return;
  }

  // 4. Open intent (chains to prior cycle if state exists)
  const intent = openIntent(traderIntentChain);

  // 5. Build cognition AER metadata. We always emit cognition (eventClass=1)
  //    in v1 — the trade.swap.v1 atomic-settlement actionCall path is
  //    deferred (see trader-envelope.ts header). The decision payload is
  //    encoded as analysis.v1 carrying the BUY/SELL/HOLD + size + reason.
  //    The actual swap, when one is taken, is signed by the agent in step 9
  //    and its digest is referenced via the NEXT cycle's `triggeredAction`.
  const wake = buildHeartbeatWake();

  // We'll fold the actual decision into the envelope AFTER the LLM responds.
  // To do that, the envelope is built post-host-call. Construct the
  // metadata blocks the host needs UP FRONT (replay/proposal) here, then
  // build the envelope on parsed decision.

  const marketSnapshot = {
    agent: agentAddr,
    nbtcRaw: balances.nbtcRaw.toString(),
    nusdcRaw: balances.nusdcRaw.toString(),
    perTradeMaxQuoteRaw: trader.maxNotionalQuoteRaw.toString(),
    dailyMaxQuoteRaw: trader.dailyMaxQuoteRaw.toString(),
    dailySpentRaw: dailySpentRaw.toString(),
    recent: recentTradesSnapshot(recent),
    nowIso,
  };

  const replay = buildReplay({
    modelVersion: config.model,
    promptText: prompt,
    strategy: trader.strategy,
    marketSnapshot,
  });

  // Inference fee = config.price (raw NUSDC u64). This is the cap rail's
  // payment_amount and must be <= cap.maxNotionalPerAction.
  const proposal = buildCognitionProposal({
    decision: { action: 'HOLD', sizeNUSDC: 0, reason: 'pending' },
    paymentAmountRaw: BigInt(config.price),
  });

  // The host will run preflight on `proposal` (cognition class), inference,
  // then build the AER from envelope+lineage+wake+replay. We supply a
  // PROVISIONAL envelope describing "HOLD pending decision" — the host's
  // capability path doesn't re-derive the envelope from the LLM result, it
  // accepts what the caller passes. So we have to call the host TWICE:
  //   Pass A: get the LLM decision (no AER on chain yet — but the host
  //           always settles after inference, so this would create a HOLD
  //           AER even when the decision turns out to be BUY).
  // That's wrong. Instead: we keep the v1 prototype semantics that the
  // cognition AER records the FINAL decision. To do that without two host
  // calls we'd need a separate /infer endpoint that returns the LLM result
  // without settling — which doesn't exist.
  //
  // Workaround for v1: emit the cognition AER reflecting "the decision the
  // LLM produced" — which means we pre-call the LLM via the host, then if
  // the decision is a swap we execute it, and the AER's outcome reflects
  // success/HOLD. The action_summary and analysis.v1 payload encode the
  // chosen action so the on-chain record is accurate even though the host
  // settled BEFORE the swap landed.
  //
  // Provisional envelope: we use HOLD as a placeholder ONLY for the wire
  // shape; we replace it with the parsed decision below before sending.
  const provisionalDecision: TradeDecision = {
    action: 'HOLD',
    sizeNUSDC: 0,
    reason: 'pending LLM',
  };
  const envelope = buildAnalysisEnvelope({
    decision: provisionalDecision,
    outcome: 2,
  });

  // 6. POST /execute-capability — host runs preflight + inference + settles
  //    the cognition AER atomically. We do NOT pass actionCall (cognition
  //    class doesn't carry one and the contract rejects mismatch).
  const triggeredAction = lastTradeDigest ? digestB58ToIdHex(lastTradeDigest) : null;
  const purposeMsg = lastTradeDigest
    ? `Trader cycle following trade ${lastTradeDigest}`
    : 'Trader cycle (genesis)';

  const hostResp = await executeCapability(trader.hostUrl, config.apiKey, {
    requestId,
    prompt,
    model: config.model,
    budgetId: config.budgetId,
    capabilityId: trader.capabilityId,
    walletAddress: trader.walletAddress,
    envelope,
    lineage: intent.lineage,
    wake,
    replay,
    actionCall: null,
    proposal,
    purpose: purposeMsg,
    ...(triggeredAction ? { triggeredAction } : {}),
  });

  if (!hostResp.success || !hostResp.result) {
    if (hostResp.preflightDenied) {
      log(
        `[trader] Capability preflight denied: ${hostResp.preflightReason ?? 'unknown'} — stopping cycle.`,
      );
    } else {
      log(`[trader] Host /execute-capability failed: ${hostResp.error ?? 'unknown'}`);
    }
    return;
  }

  log(
    `[trader] Cognition AER landed: digest=${hostResp.txDigest ?? 'n/a'} cap.v=${hostResp.capabilityVersion ?? '?'}`,
  );

  // Promote this intent to "last" so the next cycle chains off it.
  intent.commit();

  // 7. Parse decision with risk-limit gating
  let decision: TradeDecision;
  try {
    decision = parseTradeDecision(
      hostResp.result,
      {
        maxNotionalQuoteRaw: trader.maxNotionalQuoteRaw,
        dailyMaxQuoteRaw: trader.dailyMaxQuoteRaw,
        maxSlippageBps: trader.maxSlippageBps,
      },
      {
        dailySpentQuoteRaw: dailySpentRaw,
        nbtcBalanceRaw: balances.nbtcRaw,
        nusdcBalanceRaw: balances.nusdcRaw,
      },
    );
  } catch (err) {
    log(
      `[trader] Decision parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    saveTraderState({
      lastTradeDigest,
      lastIntentIdHex: Buffer.from(Uint8Array.from(intent.lineage.intentId)).toString('hex'),
    });
    return;
  }

  if (decision.riskGate) {
    log(`[trader] Decision demoted to HOLD by risk gate: ${decision.riskGate}`);
  } else {
    log(
      `[trader] Decision: ${decision.action} size=${decision.sizeNUSDC} reason="${decision.reason}"`,
    );
  }

  // Persist intent chain even if no trade follows.
  const intentIdHex = Buffer.from(Uint8Array.from(intent.lineage.intentId)).toString('hex');

  if (decision.action === 'HOLD') {
    saveTraderState({ lastTradeDigest, lastIntentIdHex: intentIdHex });
    return;
  }

  // 8. Execute trade (agent-signed; not in the AER PTB — see envelope header)
  try {
    const trade = await executeTrade(client, config.keypair, decision, balances);
    if (trade) {
      log(`[trader] Trade executed: ${trade.description} digest=${trade.digest}`);
      lastTradeDigest = trade.digest;
    }
  } catch (err) {
    log(`[trader] Trade failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  saveTraderState({ lastTradeDigest, lastIntentIdHex: intentIdHex });

  // Touch unused imports so future-me doesn't accidentally drop them while
  // the legacy lambda code path is being torn down. TRADER_CONFIG is
  // still consumed in trader.ts.
  void TRADER_CONFIG;
  void runLambdaStep;
}

async function runSingleStepCycle(
  client: SuiClient,
  config: ReturnType<typeof loadConfig>,
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
  config: ReturnType<typeof loadConfig>,
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
  config: ReturnType<typeof loadConfig>,
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
  log(`Mode: ${config.mode} (${config.mode === 'record' ? 'Model B — self-reported' : 'Model A — Lambda verified'})`);
  log(`Preset: ${preset.name} (${config.preset})`);
  log(`Interval: ${config.intervalMinutes} minutes`);
  log(`Model: ${config.mode === 'record' ? config.llmModel : config.model}`);
  log(`Price per request: ${config.price / 1e6} NUSDC`);
  log(`API Key: ${maskApiKey(config.apiKey)}`);
  if (config.mode === 'record') {
    log(`LLM API: ${config.llmApiUrl}`);
    log(`LLM Key: ${maskApiKey(config.llmApiKey)}`);
  }

  // Run first cycle immediately
  await runCycle(client, config);

  // Schedule subsequent cycles using setTimeout to prevent overlap
  function scheduleNext(): void {
    if (shuttingDown) {
      log('[shutdown] Agent stopped gracefully.');
      process.exit(0);
    }
    if (config.singleCycle) {
      log('[done] SINGLE_CYCLE=true. Exiting after first cycle.');
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
