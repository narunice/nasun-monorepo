/**
 * Analyst preset (Plan D D-4) — cognition-only LLM cycle triggered by
 * user_message wake events.
 *
 * Always emits a cognition AER (event_class=1, action_type=analysis.v1,
 * outcome=hold-noop). Never executes a trade — that requires a separate
 * confirmed execution wake (D-5).
 *
 * Flow:
 *   1. isPendingActive check (skip if proposal lock is live)
 *   2. checkBudget
 *   3. fetchAgentBalances (market context for prompt)
 *   4. createRequest (on-chain budget deduction)
 *   5. POST /infer (LLM reasons over user message + market context)
 *   6. parseTradeDecision (reuse trader parser)
 *   7. buildAnalysisEnvelope (outcome=hold-noop regardless of LLM direction)
 *   8. Build lineage from ctx.intentId ULID bytes, ctx.parentIntentId as parent
 *   9. POST /execute-capability (cognition mode: actionCall=null, escrow=undefined)
 *  10. Return WakeOutcome
 *
 * The analyst does NOT read `openIntent` / `IntentChainState` — intent_id comes
 * from the chat-server's WakeContext (ULID generated upstream, D-1 session model).
 */

import { createHash } from 'node:crypto';

import type { SuiClient } from '@mysten/sui/client';
import { intentIdToBytes } from '@nasun/baram-sdk';

import {
  checkBudget as defaultCheckBudget,
  createRequest as defaultCreateRequest,
  isPendingActive as defaultIsPendingActive,
  categorizeError,
} from '../baram-client.js';
import {
  infer as defaultInfer,
  executeCapability as defaultExecuteCapability,
} from '../host-client.js';
import {
  fetchAgentBalances as defaultFetchAgentBalances,
  dailySpentQuoteRaw as defaultDailySpentQuoteRaw,
  recentTrades as defaultRecentTrades,
  parseTradeDecision as defaultParseTradeDecision,
  type TradeDecision,
} from './trader.js';
import {
  buildAnalysisEnvelope,
  buildReplay,
  buildCognitionProposal,
  recentTradesSnapshot,
  ACTION_TYPE_ANALYSIS,
} from './trader-envelope.js';
import type { Config } from '../config.js';
import type { WakeContext, WakeOutcome } from '../wake-router.js';

// Byte-stable analyst persona system prompt fragment. Changing this text
// will change prompt_template_hash in all subsequent cognition AERs, which
// is intentional — verifiers replay the exact context.
const ANALYST_PERSONA_PROMPT = `You are a financial AI analyst for a Nasun DEX trading agent.
The user has sent a question about their portfolio or trading decisions.

Your task:
1. Review the current portfolio context and market state provided below.
2. Answer the user's specific question with a clear recommendation.
3. Express your final recommendation as one of: HOLD, BUY <amount>, or SELL <amount>.

Always respond with exactly this JSON (no markdown, no extra text):
{"action":"BUY"|"SELL"|"HOLD","sizeNUSDC":<number>,"reason":"<one sentence: answer the user question + your reasoning>"}

Rules:
- BUY swaps NUSDC -> NBTC (requires sufficient NUSDC balance).
- SELL swaps NBTC -> NUSDC (requires non-zero NBTC balance).
- HOLD means you advise no trade at this time.
- sizeNUSDC must be 0 for HOLD.
- Keep reason under 200 characters.`;

export interface AnalystDeps {
  infer: typeof defaultInfer;
  executeCapability: typeof defaultExecuteCapability;
  checkBudget: typeof defaultCheckBudget;
  createRequest: typeof defaultCreateRequest;
  isPendingActive: typeof defaultIsPendingActive;
  fetchAgentBalances: typeof defaultFetchAgentBalances;
  dailySpentQuoteRaw: typeof defaultDailySpentQuoteRaw;
  recentTrades: typeof defaultRecentTrades;
  parseTradeDecision: typeof defaultParseTradeDecision;
  log: (msg: string) => void;
  nowIso: () => string;
}

const REAL_DEPS: AnalystDeps = {
  infer: defaultInfer,
  executeCapability: defaultExecuteCapability,
  checkBudget: defaultCheckBudget,
  createRequest: defaultCreateRequest,
  isPendingActive: defaultIsPendingActive,
  fetchAgentBalances: defaultFetchAgentBalances,
  dailySpentQuoteRaw: defaultDailySpentQuoteRaw,
  recentTrades: defaultRecentTrades,
  parseTradeDecision: defaultParseTradeDecision,
  log: (msg) => {
    const ts = new Date().toLocaleString('en-US');
    console.log(`[${ts}] ${msg}`);
  },
  nowIso: () => new Date().toISOString(),
};

/**
 * Run one analyst cycle triggered by a user_message wake event.
 * Returns a WakeOutcome suitable for the idempotency store.
 */
export async function runAnalystPreset(
  client: SuiClient,
  config: Config,
  ctx: WakeContext,
  depsIn: Partial<AnalystDeps> = {},
): Promise<WakeOutcome> {
  const deps: AnalystDeps = { ...REAL_DEPS, ...depsIn };
  const trader = config.trader;

  if (!trader) {
    deps.log('[analyst] Trader config (HOST_URL/CAPABILITY_ID/WALLET_ADDRESS) not set — skipping analyst cycle.');
    return { ok: false, status: 'rejected', reason: 'trader_config_missing' };
  }

  // 1. Skip if an unconfirmed proposal is pending on-chain (D-4 §A5').
  if (config.baramAerPackageId) {
    let pending: boolean;
    try {
      pending = await deps.isPendingActive(
        client,
        config.baramAerPackageId,
        trader.capabilityId,
        ctx.nowMs,
        config.agentAddress,
      );
    } catch (err) {
      deps.log(`[analyst] isPendingActive check failed (proceeding): ${err instanceof Error ? err.message : err}`);
      pending = false;
    }
    if (pending) {
      deps.log('[analyst] Pending proposal lock active — skipping analyst cycle.');
      return { ok: true, status: 'skipped', reason: 'pending_lock' };
    }
  }

  // 2. Budget check.
  let budget;
  try {
    budget = await deps.checkBudget(client, config.budgetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[analyst] Budget check failed: ${msg}`);
    return { ok: false, status: 'rejected', reason: `budget_check_failed: ${msg}` };
  }
  if (!budget.isActive) {
    deps.log('[analyst] Budget is inactive.');
    return { ok: false, status: 'rejected', reason: 'budget_inactive' };
  }
  if (budget.balance < config.price) {
    deps.log(`[analyst] Insufficient balance: ${budget.balance} < ${config.price}.`);
    return { ok: false, status: 'rejected', reason: 'insufficient_balance' };
  }

  // 3. Market context for prompt.
  const agentAddr = config.agentAddress;
  const balances = await deps.fetchAgentBalances(client, agentAddr);
  const dailySpentRaw = deps.dailySpentQuoteRaw();
  const recent = deps.recentTrades();
  const nowIso = deps.nowIso();

  const nbtcHuman = (Number(balances.nbtcRaw) / 1e8).toFixed(8);
  const nusdcHuman = (Number(balances.nusdcRaw) / 1e6).toFixed(6);
  const maxPerTrade = (Number(trader.maxNotionalQuoteRaw) / 1e6).toFixed(2);
  const dailyRemaining = (Number(trader.dailyMaxQuoteRaw - dailySpentRaw) / 1e6).toFixed(2);
  const recentText = recent.length === 0
    ? 'None'
    : recent.slice(-3).map(r => `${r.action} ~${(Number(r.sizeQuoteRaw) / 1e6).toFixed(2)} NUSDC at ${new Date(r.ts).toISOString()}`).join('; ');

  const userMessage = ctx.message ?? '(no message)';

  const fullPrompt = [
    ANALYST_PERSONA_PROMPT,
    '',
    `User question: ${userMessage}`,
    '',
    'Portfolio context:',
    `- NBTC balance: ${nbtcHuman}`,
    `- NUSDC balance: ${nusdcHuman}`,
    `- Max per trade: ${maxPerTrade} NUSDC`,
    `- Daily budget remaining: ${dailyRemaining} NUSDC`,
    `- Recent trades: ${recentText}`,
    `- Current time: ${nowIso}`,
    `- Strategy: ${trader.strategy.id}`,
  ].join('\n');

  // 4. On-chain request (budget deduction).
  let requestId: number;
  try {
    const req = await deps.createRequest(client, config.keypair, config, fullPrompt, 'ai_inference');
    requestId = req.requestId;
    deps.log(`[analyst] On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message } = categorizeError(msg);
    deps.log(`[analyst] Request creation failed: ${message}`);
    return { ok: false, status: 'rejected', reason: `request_failed: ${message}` };
  }

  // 5. POST /infer.
  const inferResp = await deps.infer(trader.hostUrl, config.apiKey, {
    requestId,
    prompt: fullPrompt,
    model: config.model,
    capabilityId: trader.capabilityId,
    walletAddress: trader.walletAddress,
  });
  if (!inferResp.success || !inferResp.result || !inferResp.spendToken) {
    const reason = inferResp.preflightDenied
      ? (inferResp.preflightReason ?? 'preflight denied')
      : (inferResp.error ?? 'unknown');
    deps.log(`[analyst] /infer failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `infer_failed: ${reason}` };
  }

  // 6. Parse decision (reuse trader parser — analyst always emits cognition, not execution).
  let decision: TradeDecision;
  try {
    decision = deps.parseTradeDecision(
      inferResp.result,
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
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[analyst] Decision parse failed: ${msg}`);
    return { ok: false, status: 'rejected', reason: `parse_failed: ${msg}` };
  }

  deps.log(`[analyst] Decision: ${decision.action} size=${decision.sizeNUSDC} reason="${decision.reason}"`);

  // 7. Envelope — always cognition (analysis.v1), outcome=hold-noop.
  // Even if the LLM recommends BUY/SELL, the analyst AER records the
  // recommendation without executing a trade. Execution requires a
  // confirmed manual wake (D-5).
  const envelope = buildAnalysisEnvelope({ decision, outcome: 2 });

  // 8. Lineage — intent_id from WakeContext ULID (generated by chat-server).
  const intentIdBytes = Array.from(intentIdToBytes(ctx.intentId));
  const parentIntentIdBytes: number[] | null = ctx.parentIntentId
    ? Array.from(intentIdToBytes(ctx.parentIntentId))
    : null;
  const lineage = {
    intentId: intentIdBytes,
    parentIntentId: parentIntentIdBytes,
    executionId: 1,
  };

  // Wake: triggered_by_type=2 (user_message), ref=session id.
  const wake = { triggeredByType: 2 as const, triggeredByRef: ctx.sid };

  // Replay: prompt covers full context (persona + user message + market).
  const marketSnapshot = {
    agent: agentAddr,
    nbtcRaw: balances.nbtcRaw.toString(),
    nusdcRaw: balances.nusdcRaw.toString(),
    dailySpentRaw: dailySpentRaw.toString(),
    recent: recentTradesSnapshot(recent),
    nowIso,
  };
  const replay = buildReplay({
    modelVersion: config.model,
    promptText: fullPrompt,
    strategy: trader.strategy,
    marketSnapshot,
    extras: [
      ['user_message_hash', (() => { const h = createHash('sha256').update(userMessage).digest(); return new Uint8Array(h); })()],
    ],
  });

  // Cognition proposal (host preflight).
  const proposal = buildCognitionProposal({
    decision,
    paymentAmountRaw: BigInt(config.price),
  });

  // 9. POST /execute-capability (cognition mode: actionCall=null, escrow=undefined).
  const execResp = await deps.executeCapability(trader.hostUrl, config.apiKey, {
    requestId,
    resultHash: inferResp.resultHash!,
    executionTimeMs: inferResp.executionTimeMs ?? 0,
    spendToken: inferResp.spendToken!,
    nonce: inferResp.nonce!,
    expiresAt: inferResp.expiresAt!,
    model: config.model,
    budgetId: config.budgetId,
    capabilityId: trader.capabilityId,
    walletAddress: trader.walletAddress,
    envelope,
    lineage,
    wake,
    replay,
    proposal,
    actionCall: null,
    purpose: `Analyst response to user message (sid=${ctx.sid.slice(0, 8)}...)`,
  });

  if (!execResp.success) {
    const reason = execResp.preflightDenied
      ? `preflight: ${execResp.preflightReason ?? 'unknown'}`
      : (execResp.error ?? 'unknown');
    deps.log(`[analyst] /execute-capability failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `execute_failed: ${reason}` };
  }

  const summary = `${ACTION_TYPE_ANALYSIS}: ${decision.action} — ${decision.reason}`;
  deps.log(`[analyst] Cognition AER landed: digest=${execResp.txDigest ?? 'n/a'}`);

  return {
    ok: true,
    status: 'processed',
    intentId: ctx.intentId,
    aerDigest: execResp.txDigest,
    summary,
  };
}
