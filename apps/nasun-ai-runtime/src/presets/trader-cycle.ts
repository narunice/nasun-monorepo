/**
 * Trader cycle (Plan C C3-v2 §5.2).
 *
 * Extracted from index.ts so the two-call (/infer + /execute-capability)
 * flow is testable in isolation. The cycle is otherwise unchanged from
 * the prior C3-v2b shape:
 *
 *   1. checkBudget — abort fatal if inactive, defer if insufficient
 *   2. fetchAgentBalances + buildTraderPrompt
 *   3. createRequest (on-chain budget deduction)
 *   4. openIntent (chains lineage)
 *   5. POST /infer (enclave runs LLM, returns HMAC spend token)
 *   6. parseTradeDecision (risk-gate locally)
 *   7. Build envelope from FINAL decision (not provisional HOLD)
 *   8. Build proposal matching envelope (twin-trust)
 *   9. For BUY/SELL: build escrow ref + spend block + action call
 *  10. POST /execute-capability with FINAL envelope
 *  11. Promote intent + persist digests by class
 *
 * Dependencies are injected so tests can stub the network surface
 * without bringing up a host or a Sui RPC. Defaults bind to the real
 * implementations.
 */

import type { SuiClient } from '@mysten/sui/client';
import { fromBase58 } from '@mysten/sui/utils';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';

import {
  checkBudget as defaultCheckBudget,
  createRequest as defaultCreateRequest,
  isPendingActive as defaultIsPendingActive,
  categorizeError,
} from '../nasun-ai-client.js';
import {
  infer as defaultInfer,
  executeCapability as defaultExecuteCapability,
  type InferRequest,
  type InferResponse,
  type ExecuteCapabilityRequest,
  type ExecuteCapabilityResponse,
} from '../host-client.js';
import { escrow as escrowSdk } from '@nasun/baram-sdk';
import {
  TRADER_CONFIG,
  buildTraderPrompt,
  parseTradeDecision as defaultParseTradeDecision,
  buildSwapActionCall as defaultBuildSwapActionCall,
  quoteMinOut as defaultQuoteMinOut,
  fetchAgentBalances as defaultFetchAgentBalances,
  dailySpentQuoteRaw as defaultDailySpentQuoteRaw,
  recentTrades as defaultRecentTrades,
  type TradeDecision,
} from './trader.js';
import {
  buildAnalysisEnvelope,
  buildTradeSwapEnvelope,
  buildHeartbeatWake,
  buildReplay,
  newIntentChainState,
  openIntent,
  recentTradesSnapshot,
  type IntentChainState,
} from './trader-envelope.js';
import { resolveStrategyPreset } from './strategies.js';
import type { Config } from '../config.js';

// ===== Browser config sync (read from chat-server) =====

export interface BrowserTraderConfig {
  model: string;
  perTradeMaxQuoteRaw: string;
  dailyMaxQuoteRaw: string;
  promptTemplate: string | null;
  /** Optional strategy preset id (matches `strategies.ts` keys). When
   * unset or unknown, the runtime falls back to `STRATEGY` env. */
  strategyPresetId: string | null;
}

/**
 * Fetch the browser-saved TraderConfig from chat-server.
 * Returns null if unavailable (network error, 404, or auth failure) so the
 * caller can fall back to the .env defaults without aborting the cycle.
 */
export async function fetchBrowserConfig(
  chatServerBaseUrl: string,
  agentAddress: string,
  hmacSecret: string,
): Promise<BrowserTraderConfig | null> {
  // hmacSecret is hex-encoded; require >= 64 hex chars (32 bytes / 256 bits).
  if (!chatServerBaseUrl || !hmacSecret || hmacSecret.length < 64) return null;
  try {
    const addr = agentAddress.toLowerCase();
    const hmac = createHmac('sha256', Buffer.from(hmacSecret, 'hex'))
      .update(Buffer.from(addr, 'utf8'))
      .digest('hex');
    const url = `${chatServerBaseUrl.replace(/\/+$/, '')}/api/nasun-ai/config/${addr}`;
    const res = await fetch(url, {
      headers: { 'X-HMAC': hmac },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = await res.json() as { config?: Record<string, unknown> };
    const cfg = body.config;
    if (!cfg || typeof cfg !== 'object') return null;
    return {
      model: typeof cfg.model === 'string' ? cfg.model : '',
      perTradeMaxQuoteRaw: typeof cfg.perTradeMaxQuoteRaw === 'string' ? cfg.perTradeMaxQuoteRaw : '',
      dailyMaxQuoteRaw: typeof cfg.dailyMaxQuoteRaw === 'string' ? cfg.dailyMaxQuoteRaw : '',
      promptTemplate: typeof cfg.promptTemplate === 'string' ? cfg.promptTemplate : null,
      strategyPresetId: typeof cfg.strategyPresetId === 'string' ? cfg.strategyPresetId : null,
    };
  } catch {
    return null;
  }
}

export const TRADER_STATE_PATH = join(homedir(), '.baram-trader-state.json');

export interface TraderState {
  /** Plan C C3-v2 W10: digests split by event class. The previous
   *  `lastTradeDigest` field is migrated to `lastExecutionDigest` on
   *  first read; new writes use the split shape. */
  lastCognitionDigest: string | null;
  lastExecutionDigest: string | null;
  /** Last cognition AER intent_id (16-byte UUIDv7, hex-encoded). */
  lastIntentIdHex: string | null;
}

export function loadTraderState(path: string = TRADER_STATE_PATH): TraderState {
  try {
    if (existsSync(path)) {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TraderState> & {
        lastTradeDigest?: string | null;
      };
      // W10 backcompat: legacy `lastTradeDigest` carries the most recent
      // settlement, which under the v1 trader was always agent-signed
      // (execution-like). Migrate to lastExecutionDigest.
      return {
        lastCognitionDigest:
          typeof parsed.lastCognitionDigest === 'string'
            ? parsed.lastCognitionDigest
            : null,
        lastExecutionDigest:
          typeof parsed.lastExecutionDigest === 'string'
            ? parsed.lastExecutionDigest
            : typeof parsed.lastTradeDigest === 'string'
              ? parsed.lastTradeDigest
              : null,
        lastIntentIdHex:
          typeof parsed.lastIntentIdHex === 'string' ? parsed.lastIntentIdHex : null,
      };
    }
  } catch {
    // Corrupt file — fall through to default
  }
  return {
    lastCognitionDigest: null,
    lastExecutionDigest: null,
    lastIntentIdHex: null,
  };
}

export function saveTraderState(state: TraderState, path: string = TRADER_STATE_PATH): void {
  try {
    writeFileSync(path, JSON.stringify(state, null, 2));
  } catch (err) {
    console.warn('[trader] Failed to persist state:', err instanceof Error ? err.message : err);
  }
}

export function digestB58ToIdHex(digestB58: string): string | null {
  try {
    const bytes = fromBase58(digestB58);
    if (bytes.length !== 32) return null;
    return '0x' + Buffer.from(bytes).toString('hex');
  } catch {
    return null;
  }
}

/** Mutable cross-cycle state owned by the caller (index.ts in prod, or
 *  a per-test instance in unit tests). */
export interface TraderCycleRuntime {
  intentChain: IntentChainState;
  state: TraderState;
  /** Cached `initialSharedVersion` for the AgentEscrow. Stable for the
   *  object's lifetime; we fetch once and reuse across cycles. */
  cachedEscrowInitialSharedVersion: { value: bigint | null };
}

export function newTraderCycleRuntime(state?: TraderState): TraderCycleRuntime {
  const initial = state ?? loadTraderState();
  const chain = newIntentChainState();
  if (initial.lastIntentIdHex) {
    try {
      chain.lastIntentId = Array.from(Buffer.from(initial.lastIntentIdHex, 'hex'));
    } catch {
      // Ignore — start a fresh chain.
    }
  }
  return {
    intentChain: chain,
    state: initial,
    cachedEscrowInitialSharedVersion: { value: null },
  };
}

export interface TraderCycleDeps {
  infer: typeof defaultInfer;
  executeCapability: typeof defaultExecuteCapability;
  checkBudget: typeof defaultCheckBudget;
  createRequest: typeof defaultCreateRequest;
  /** Plan D §A5': skip cycle if an unconfirmed proposal lock is live. Optional
   *  so tests that don't care can omit it. Defaults to the real devInspect call. */
  isPendingActive?: typeof defaultIsPendingActive;
  fetchEscrow: typeof escrowSdk.fetchEscrow;
  fetchAgentBalances: typeof defaultFetchAgentBalances;
  dailySpentQuoteRaw: typeof defaultDailySpentQuoteRaw;
  recentTrades: typeof defaultRecentTrades;
  parseTradeDecision: typeof defaultParseTradeDecision;
  buildSwapActionCall: typeof defaultBuildSwapActionCall;
  quoteMinOut: typeof defaultQuoteMinOut;
  saveState: (s: TraderState) => void;
  log: (msg: string) => void;
  nowIso: () => string;
}

const REAL_DEPS: TraderCycleDeps = {
  infer: defaultInfer,
  executeCapability: defaultExecuteCapability,
  checkBudget: defaultCheckBudget,
  createRequest: defaultCreateRequest,
  isPendingActive: defaultIsPendingActive,
  fetchEscrow: escrowSdk.fetchEscrow,
  fetchAgentBalances: defaultFetchAgentBalances,
  dailySpentQuoteRaw: defaultDailySpentQuoteRaw,
  recentTrades: defaultRecentTrades,
  parseTradeDecision: defaultParseTradeDecision,
  buildSwapActionCall: defaultBuildSwapActionCall,
  quoteMinOut: defaultQuoteMinOut,
  saveState: (s) => saveTraderState(s),
  log: (msg) => {
    const ts = new Date().toLocaleString('en-US');
    console.log(`[${ts}] ${msg}`);
  },
  nowIso: () => new Date().toISOString(),
};

export type TraderCycleOutcome =
  | 'budget_check_failed'
  | 'budget_inactive'
  | 'insufficient_balance'
  | 'pending_lock'
  | 'request_failed'
  | 'infer_failed'
  | 'parse_failed'
  | 'execute_failed'
  | 'succeeded';

export interface TraderCycleResult {
  outcome: TraderCycleOutcome;
  /** Settlement tx digest from /execute-capability, if it landed. */
  txDigest?: string;
  decision?: TradeDecision;
  finalEventClass?: 1 | 2;
  /** True iff outcome is a fatal error (caller should shut down). */
  fatal?: boolean;
  /** Captured rejection reason for non-fatal failures. */
  reason?: string;
}

/**
 * Run one trader cycle. Returns a `TraderCycleResult` describing the
 * terminal state instead of mutating module-scope state directly, so
 * tests can drive the function deterministically. State that survives
 * across cycles (intent chain, last digests, cached escrow version)
 * lives on the caller-owned `runtime` object.
 */
export async function runTraderCycle(
  client: SuiClient,
  config: Config,
  runtime: TraderCycleRuntime,
  depsIn: Partial<TraderCycleDeps> = {},
): Promise<TraderCycleResult> {
  const deps: TraderCycleDeps = { ...REAL_DEPS, ...depsIn };
  const trader = config.trader;
  if (!trader) {
    deps.log('[trader] HOST_URL/CAPABILITY_ID/WALLET_ADDRESS not configured; cannot run trader cycle.');
    return { outcome: 'budget_check_failed', fatal: true, reason: 'trader config missing' };
  }
  const agentAddr = config.agentAddress;

  // 0a. Fetch browser-saved config from chat-server (best-effort, falls back to .env defaults).
  const browserCfg = await fetchBrowserConfig(
    config.chatServerBaseUrl,
    agentAddr,
    process.env.BARAM_CHAT_SERVER_HMAC_SECRET ?? '',
  );
  const effectiveModel = (browserCfg?.model || config.model) as string;
  const effectiveMaxNotional = browserCfg?.perTradeMaxQuoteRaw
    ? BigInt(browserCfg.perTradeMaxQuoteRaw)
    : trader.maxNotionalQuoteRaw;
  const effectiveDailyMax = browserCfg?.dailyMaxQuoteRaw
    ? BigInt(browserCfg.dailyMaxQuoteRaw)
    : trader.dailyMaxQuoteRaw;
  // If the browser config specifies a strategy preset, resolve it.
  // resolveStrategyPreset returns the conservative_dca fallback when the
  // id is missing or unknown, so we keep the env-derived `trader.strategy`
  // only when the browser didn't provide one at all.
  const effectiveStrategy = browserCfg?.strategyPresetId
    ? resolveStrategyPreset(browserCfg.strategyPresetId)
    : trader.strategy;
  if (browserCfg) {
    deps.log(
      `[trader] Browser config loaded: model=${effectiveModel}, perTrade=${effectiveMaxNotional}, dailyMax=${effectiveDailyMax}, strategy=${effectiveStrategy.id}`,
    );
  } else {
    deps.log('[trader] Browser config unavailable — using .env defaults');
  }

  // 0. Skip if an unconfirmed proposal is pending on-chain (Plan D §A5').
  if (deps.isPendingActive && config.baramAerPackageId) {
    let pending = false;
    try {
      pending = await deps.isPendingActive(
        client,
        config.baramAerPackageId,
        trader.capabilityId,
        Date.now(),
        agentAddr,
      );
    } catch (err) {
      deps.log(`[trader] isPendingActive check failed (proceeding): ${err instanceof Error ? err.message : err}`);
    }
    if (pending) {
      deps.log('[trader] Pending proposal lock active — skipping heartbeat cycle.');
      return { outcome: 'pending_lock' };
    }
  }

  // 1. Budget
  let budget;
  try {
    budget = await deps.checkBudget(client, config.budgetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[error] Budget check failed: ${msg}`);
    return { outcome: 'budget_check_failed', reason: msg };
  }
  if (!budget.isActive) {
    deps.log('[fatal] Budget is inactive. Stopping agent.');
    return { outcome: 'budget_inactive', fatal: true };
  }
  if (budget.balance < config.price) {
    deps.log(`[wait] Insufficient balance: ${budget.balance} < ${config.price}. Will retry next cycle.`);
    return { outcome: 'insufficient_balance' };
  }
  deps.log(
    `Budget: ${budget.balance} balance, ${budget.totalSpent} spent, ${budget.requestCount} requests`,
  );

  // 2. Balances + market context
  const balances = await deps.fetchAgentBalances(client, agentAddr);
  deps.log(
    `Trader balances: ${(Number(balances.nbtcRaw) / 1e8).toFixed(8)} NBTC, ${(Number(balances.nusdcRaw) / 1e6).toFixed(6)} NUSDC`,
  );
  const dailySpentRaw = deps.dailySpentQuoteRaw();
  const recent = deps.recentTrades();
  const nowIso = deps.nowIso();
  const prompt = buildTraderPrompt({
    agentAddr,
    nbtcRaw: balances.nbtcRaw,
    nusdcRaw: balances.nusdcRaw,
    perTradeMaxQuoteRaw: effectiveMaxNotional,
    dailyMaxQuoteRaw: effectiveDailyMax,
    dailySpentRaw,
    recent,
    strategy: effectiveStrategy,
    nowIso,
    customSystemPrompt: browserCfg?.promptTemplate ?? null,
  });

  // 3. Create on-chain request (budget deduction).
  let requestId: number;
  try {
    const req = await deps.createRequest(client, config.keypair, config, prompt, 'ai_inference');
    requestId = req.requestId;
    deps.log(`On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    deps.log(`[trader] Request creation failed: ${message}`);
    return { outcome: 'request_failed', fatal, reason: message };
  }

  // 4. Open intent + replay metadata.
  const intent = openIntent(runtime.intentChain);
  const wake = buildHeartbeatWake();
  const marketSnapshot = {
    agent: agentAddr,
    nbtcRaw: balances.nbtcRaw.toString(),
    nusdcRaw: balances.nusdcRaw.toString(),
    perTradeMaxQuoteRaw: effectiveMaxNotional.toString(),
    dailyMaxQuoteRaw: effectiveDailyMax.toString(),
    dailySpentRaw: dailySpentRaw.toString(),
    recent: recentTradesSnapshot(recent),
    nowIso,
  };
  const replay = buildReplay({
    modelVersion: effectiveModel,
    promptText: prompt,
    strategy: effectiveStrategy,
    marketSnapshot,
  });

  // 5. POST /infer.
  const inferResp = await deps.infer(trader.hostUrl, config.apiKey, {
    requestId,
    prompt,
    model: effectiveModel,
    capabilityId: trader.capabilityId,
    walletAddress: trader.walletAddress,
  });
  if (!inferResp.success || !inferResp.result || !inferResp.spendToken) {
    if (inferResp.preflightDenied) {
      deps.log(`[trader] /infer preflight denied: ${inferResp.preflightReason ?? 'unknown'}`);
      return { outcome: 'infer_failed', reason: inferResp.preflightReason ?? 'preflight denied' };
    }
    deps.log(`[trader] /infer failed: ${inferResp.error ?? 'unknown'}`);
    return { outcome: 'infer_failed', reason: inferResp.error ?? 'unknown' };
  }

  // 6. Parse decision (risk-gate locally).
  let decision: TradeDecision;
  try {
    decision = deps.parseTradeDecision(
      inferResp.result,
      {
        maxNotionalQuoteRaw: effectiveMaxNotional,
        dailyMaxQuoteRaw: effectiveDailyMax,
        maxSlippageBps: trader.maxSlippageBps,
      },
      {
        dailySpentQuoteRaw: dailySpentRaw,
        nbtcBalanceRaw: balances.nbtcRaw,
        nusdcBalanceRaw: balances.nusdcRaw,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[trader] Decision parse failed: ${msg}`);
    deps.saveState({
      lastCognitionDigest: runtime.state.lastCognitionDigest,
      lastExecutionDigest: runtime.state.lastExecutionDigest,
      lastIntentIdHex: Buffer.from(Uint8Array.from(intent.lineage.intentId)).toString('hex'),
    });
    return { outcome: 'parse_failed', reason: msg };
  }
  if (decision.riskGate) {
    deps.log(`[trader] Decision demoted to HOLD by risk gate: ${decision.riskGate}`);
  } else {
    deps.log(
      `[trader] Decision: ${decision.action} size=${decision.sizeNUSDC} reason="${decision.reason}"`,
    );
  }

  // 7. Build envelope from FINAL decision (DV11).
  // BUY/SELL must use trade.swap.v1 because the host action-class
  // registry only registers the DeepBook swap functions under that
  // label; emitting analysis.v1 on an exec body trips
  // findFunctionEntry in /execute-capability.
  const finalEnvelope =
    decision.action === 'HOLD'
      ? buildAnalysisEnvelope({ decision, outcome: 2 })
      : buildTradeSwapEnvelope({ decision, outcome: 1 });
  const finalEventClass: 1 | 2 = decision.action === 'HOLD' ? 1 : 2;

  // 8. Build proposal matching the envelope.
  const buyOrSell = decision.action === 'BUY' || decision.action === 'SELL';
  const sizeRaw = BigInt(Math.floor(decision.sizeNUSDC * 1_000_000));
  const inputAssetType =
    decision.action === 'BUY' ? trader.coinNusdcType : trader.coinNbtcType;
  const outputAssetType =
    decision.action === 'BUY' ? trader.coinNbtcType : trader.coinNusdcType;
  const proposalForExec = buyOrSell
    ? {
        eventClass: 2 as const,
        actionType: finalEnvelope.actionType,
        paymentAmount: String(config.price),
        exec: {
          targetPackage: TRADER_CONFIG.deepbookPackage,
          module: 'pool',
          fn:
            decision.action === 'BUY'
              ? 'swap_exact_quote_for_base'
              : 'swap_exact_base_for_quote',
          inputAssetType,
          outputAssetType,
          inputAmount: sizeRaw.toString(),
          maxSlippageBps: trader.maxSlippageBps,
          poolId: TRADER_CONFIG.pool,
        },
      }
    : {
        eventClass: 1 as const,
        actionType: finalEnvelope.actionType,
        paymentAmount: String(config.price),
      };

  // 9. Build escrow ref + spend block + action call (execution only).
  let escrowBlock: { objectId: string; initialSharedVersion: string; capabilityId: string } | null = null;
  let spendBlock: { coinAssetType: string; amount: string } | null = null;
  let actionCallBlock: ReturnType<typeof defaultBuildSwapActionCall> | null = null;
  if (buyOrSell) {
    try {
      if (runtime.cachedEscrowInitialSharedVersion.value === null) {
        const ref = await deps.fetchEscrow(client, trader.escrowId);
        runtime.cachedEscrowInitialSharedVersion.value = ref.initialSharedVersion;
      }
      escrowBlock = {
        objectId: trader.escrowId,
        initialSharedVersion: runtime.cachedEscrowInitialSharedVersion.value.toString(),
        capabilityId: trader.capabilityId,
      };
      spendBlock = { coinAssetType: inputAssetType, amount: sizeRaw.toString() };
      // Host's HIGH #2 floor rejects min_out < expected*(10000-bps)/10000.
      // Quote off the live pool so the trader's submitted floor clears
      // the server's recomputation on first try. Quote-then-submit race
      // is acceptable on devnet (thin pool, single trader).
      const minOut = await deps.quoteMinOut({
        client,
        direction: decision.action as 'BUY' | 'SELL',
        sizeInRaw: sizeRaw,
        slippageBps: trader.maxSlippageBps,
      });
      actionCallBlock = deps.buildSwapActionCall({
        direction: decision.action as 'BUY' | 'SELL',
        minOut,
      });
    } catch (err) {
      deps.log(
        `[trader] escrow fetch failed (cycle deferred to cognition): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const triggeredAction = runtime.state.lastExecutionDigest
    ? digestB58ToIdHex(runtime.state.lastExecutionDigest)
    : null;
  const purposeMsg = runtime.state.lastExecutionDigest
    ? `Trader cycle following trade ${runtime.state.lastExecutionDigest}`
    : 'Trader cycle (genesis)';

  // 10. POST /execute-capability.
  const execReq: ExecuteCapabilityRequest = {
    requestId,
    resultHash: inferResp.resultHash!,
    executionTimeMs: inferResp.executionTimeMs ?? 0,
    spendToken: inferResp.spendToken!,
    nonce: inferResp.nonce!,
    expiresAt: inferResp.expiresAt!,
    model: effectiveModel,
    budgetId: config.budgetId,
    capabilityId: trader.capabilityId,
    walletAddress: trader.walletAddress,
    envelope: finalEnvelope,
    lineage: intent.lineage,
    wake,
    replay,
    proposal: proposalForExec,
    actionCall: actionCallBlock,
    escrow: escrowBlock,
    spend: spendBlock,
    purpose: purposeMsg,
    ...(triggeredAction ? { triggeredAction } : {}),
  };
  const execResp = await deps.executeCapability(trader.hostUrl, config.apiKey, execReq);

  if (!execResp.success) {
    const reason = execResp.preflightDenied
      ? `preflight: ${execResp.preflightReason ?? 'unknown'}`
      : (execResp.error ?? 'unknown');
    deps.log(`[trader] /execute-capability failed: ${reason}`);
    deps.saveState({
      lastCognitionDigest: runtime.state.lastCognitionDigest,
      lastExecutionDigest: runtime.state.lastExecutionDigest,
      lastIntentIdHex: Buffer.from(Uint8Array.from(intent.lineage.intentId)).toString('hex'),
    });
    return { outcome: 'execute_failed', reason, decision, finalEventClass };
  }

  deps.log(
    `[trader] AER landed: class=${finalEventClass} digest=${execResp.txDigest ?? 'n/a'} cap.v=${execResp.capabilityVersion ?? '?'}`,
  );

  // 11. Promote intent + persist digests by class.
  intent.commit();
  if (finalEventClass === 2 && execResp.txDigest) {
    runtime.state.lastExecutionDigest = execResp.txDigest;
  } else if (finalEventClass === 1 && execResp.txDigest) {
    runtime.state.lastCognitionDigest = execResp.txDigest;
  }
  deps.saveState({
    lastCognitionDigest: runtime.state.lastCognitionDigest,
    lastExecutionDigest: runtime.state.lastExecutionDigest,
    lastIntentIdHex: Buffer.from(Uint8Array.from(intent.lineage.intentId)).toString('hex'),
  });

  return {
    outcome: 'succeeded',
    txDigest: execResp.txDigest,
    decision,
    finalEventClass,
  };
}

// Re-export helpers tests rely on without re-importing from sub-modules.
export { openIntent, buildAnalysisEnvelope } from './trader-envelope.js';
export type { InferRequest, InferResponse, ExecuteCapabilityRequest, ExecuteCapabilityResponse };
