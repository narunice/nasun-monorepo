/**
 * Analyst preset (Plan D D-4) -- cognition-only LLM cycle triggered by
 * user_message wake events.
 *
 * Always emits a cognition AER (event_class=1, action_type=analysis.v1,
 * outcome=hold-noop). Never executes a trade -- that requires a separate
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
 * The analyst does NOT read `openIntent` / `IntentChainState` -- intent_id comes
 * from the chat-server's WakeContext (ULID generated upstream, D-1 session model).
 */

import { createHash } from 'node:crypto';

import type { SuiClient } from '@mysten/sui/client';
import {
  intentIdToBytes,
  newIntentId,
  DEFAULT_PROPOSAL_TTL_MS,
  type Proposal,
} from '@nasun/baram-sdk';

import {
  checkBudget as defaultCheckBudget,
  createRequest as defaultCreateRequest,
  isPendingActive as defaultIsPendingActive,
  setPendingProposal as defaultSetPendingProposal,
  categorizeError,
} from '../nasun-ai-client.js';
import {
  infer as defaultInfer,
  executeCapability as defaultExecuteCapability,
} from '../host-client.js';
import { signSettle, canonicalJsonSha256, ZERO_ACTION_CALL_HASH } from '../sig.js';

/**
 * Inline cap fetch -- kept local to avoid an extra module import. Mirrors
 * trader-cycle.ts:fetchCapabilityFields. Both paths target the same
 * Capability shape (baram_aer::capability::Capability).
 */
async function fetchCapabilityFieldsAnalyst(
  client: SuiClient,
  capabilityId: string,
): Promise<{ owner: string; version: string }> {
  const obj = await client.getObject({ id: capabilityId, options: { showContent: true } });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Capability ${capabilityId} not found or non-Move`);
  }
  const fields = obj.data.content.fields as Record<string, unknown>;
  const ownerRaw = fields.owner;
  const versionRaw = fields.version;
  if (typeof ownerRaw !== 'string' || typeof versionRaw !== 'string') {
    throw new Error('Capability owner/version missing');
  }
  const owner = ownerRaw.toLowerCase().startsWith('0x')
    ? ownerRaw.toLowerCase()
    : `0x${ownerRaw.toLowerCase()}`;
  return { owner, version: versionRaw };
}
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
} from './trader-envelope.js';
import type { Config } from '../config.js';
import type { WakeContext, WakeOutcome } from '../wake-router.js';
import { recordAerLanded } from '../aer-heartbeat.js';

// Byte-stable analyst persona system prompt fragment. Changing this text
// will change prompt_template_hash in all subsequent cognition AERs, which
// is intentional -- verifiers replay the exact context.
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
  /** Optional: if provided, sets the onchain pending lock for BUY/SELL proposals. */
  setPendingProposal?: typeof defaultSetPendingProposal;
  /** PR1.A: cap owner+version snapshot. Mirrors trader-cycle. */
  fetchCapabilityFields: typeof fetchCapabilityFieldsAnalyst;
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
  setPendingProposal: defaultSetPendingProposal,
  fetchCapabilityFields: fetchCapabilityFieldsAnalyst,
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
    deps.log('[analyst] Trader config (HOST_URL/CAPABILITY_ID/WALLET_ADDRESS) not set -- skipping analyst cycle.');
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
      deps.log('[analyst] Pending proposal lock active -- skipping analyst cycle.');
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
  let promptHashHex: string;
  try {
    const req = await deps.createRequest(client, config.keypair, config, fullPrompt, 'ai_inference');
    requestId = req.requestId;
    promptHashHex = req.promptHashHex;
    deps.log(`[analyst] On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message } = categorizeError(msg);
    deps.log(`[analyst] Request creation failed: ${message}`);
    return { ok: false, status: 'rejected', reason: `request_failed: ${message}` };
  }

  // 4a. Snapshot capability owner+version (same pattern as trader-cycle).
  const principalAddress = trader.walletAddress.toLowerCase();
  const agentAddress = config.agentAddress.toLowerCase();
  let expectedCapabilityVersion: string;
  try {
    const capFields = await deps.fetchCapabilityFields(client, trader.capabilityId);
    expectedCapabilityVersion = capFields.version;
    if (capFields.owner !== principalAddress) {
      deps.log(`[analyst] capability owner ${capFields.owner} != trader.walletAddress; aborting.`);
      return { ok: false, status: 'rejected', reason: 'capability_owner_mismatch' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[analyst] capability fetch failed: ${msg}`);
    return { ok: false, status: 'rejected', reason: `capability_fetch_failed: ${msg}` };
  }

  // 5. POST /infer.
  const promptHashWire = `0x${promptHashHex}`;
  const inferResp = await deps.infer(trader.hostUrl, config.apiKey, {
    requestId,
    prompt: fullPrompt,
    model: config.model,
    capabilityId: trader.capabilityId,
    principalAddress,
    promptHash: promptHashWire,
    expectedCapabilityVersion,
  });
  if (!inferResp.success || !inferResp.result || !inferResp.resultHash) {
    const reason = inferResp.preflightDenied
      ? (inferResp.preflightReason ?? 'preflight denied')
      : (inferResp.error ?? 'unknown');
    deps.log(`[analyst] /infer failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `infer_failed: ${reason}` };
  }

  // 6. Parse decision (reuse trader parser -- analyst always emits cognition, not execution).
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

  // 7. Envelope -- always cognition (analysis.v1), outcome=hold-noop.
  // Even if the LLM recommends BUY/SELL, the analyst AER records the
  // recommendation without executing a trade. Execution requires a
  // confirmed manual wake (D-5).
  const envelope = buildAnalysisEnvelope({ decision, outcome: 2 });

  // 8. Lineage -- intent_id from WakeContext ULID (generated by chat-server).
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

  // 9. POST /execute-capability (cognition AER, agent-signed settlement intent).
  const envelopeHash = canonicalJsonSha256(envelope);
  const actionCallHash = ZERO_ACTION_CALL_HASH;
  const sig2 = await signSettle(config.keypair, {
    v: 1,
    kind: 'nasun-ai-settle',
    requestId: String(requestId),
    promptHash: promptHashWire,
    resultHash: inferResp.resultHash,
    agentAddress,
    principalAddress,
    capabilityId: trader.capabilityId,
    expectedCapabilityVersion,
    envelopeHash,
    actionCallHash,
  });
  const execResp = await deps.executeCapability(trader.hostUrl, config.apiKey, {
    requestId,
    promptHash: promptHashWire,
    resultHash: inferResp.resultHash,
    result: inferResp.result,
    executionTimeMs: inferResp.executionTimeMs ?? 0,
    model: config.model,
    budgetId: config.budgetId,
    capabilityId: trader.capabilityId,
    agentAddress,
    principalAddress,
    expectedCapabilityVersion,
    envelope,
    lineage,
    wake,
    replay,
    proposal,
    envelopeHash,
    actionCallHash,
    sig2,
    actionCall: null,
    escrow: null,
    spend: null,
    purpose: `Analyst response to user message (sid=${ctx.sid.slice(0, 8)}...)`,
  });

  if (!execResp.success) {
    const reason = execResp.preflightDenied
      ? `preflight: ${execResp.preflightReason ?? 'unknown'}`
      : (execResp.error ?? 'unknown');
    deps.log(`[analyst] /execute-capability failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `execute_failed: ${reason}` };
  }

  // User-facing summary surfaced via Telegram / chat-server response.
  // Friendly verb instead of the raw action_type tag (`analysis.v1:`) which
  // leaked internal AER plumbing into the operator's chat.
  const VERB: Record<string, string> = { BUY: 'Buying', SELL: 'Selling', HOLD: 'Holding' };
  const summary = `${VERB[decision.action] ?? decision.action}: ${decision.reason}`;
  deps.log(`[analyst] Cognition AER landed: digest=${execResp.txDigest ?? 'n/a'}`);
  recordAerLanded();

  // For BUY/SELL decisions: build a trade proposal artifact, set the onchain
  // pending lock, and include the proposal in the WakeOutcome so the
  // chat-server can send an inline keyboard for user confirmation (D-5 §A5).
  if (decision.action !== 'HOLD' && deps.setPendingProposal && config.baramAerPackageId && config.trader) {
    const proposalId = newIntentId();
    const expiresAtMs = Date.now() + DEFAULT_PROPOSAL_TTL_MS;
    const expiresAtIso = new Date(expiresAtMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const sizeQuoteRaw = String(Math.round(decision.sizeNUSDC * 1e6));

    // reasoning_hash: hash of the cognition AER payload (use prompt hash as proxy).
    const reasoningHash = '0x' + createHash('sha256').update(fullPrompt).digest('hex');
    // market_snapshot_hash: same hash used in replay metadata.
    const msBytes = replay.marketSnapshotHash;
    const marketSnapshotHashHex = msBytes && msBytes.length > 0
      ? '0x' + Buffer.from(msBytes).toString('hex')
      : '0x' + '0'.repeat(64);
    // prompt_template_hash: hash of system persona + strategy.
    const ptHashHex = '0x' + Buffer.from(replay.promptTemplateHash).toString('hex');

    const proposal: Proposal = {
      proposal_id: proposalId,
      intent_id: ctx.intentId,
      action_type: 'trade.swap.v1',
      summary: `${decision.action} ~${decision.sizeNUSDC} NUSDC: ${decision.reason}`,
      side: decision.action as 'BUY' | 'SELL',
      symbol: 'NBTC',
      size_quote_raw: sizeQuoteRaw,
      max_slippage_bps: trader.maxSlippageBps,
      confidence: 0.8,
      reasoning_hash: reasoningHash,
      market_snapshot_hash: marketSnapshotHashHex,
      model_version: config.model,
      prompt_template_hash: ptHashHex,
      expires_at: expiresAtIso,
    };

    try {
      const proposalIdBytes = intentIdToBytes(proposalId);
      await deps.setPendingProposal(
        client,
        config.keypair,
        config.baramAerPackageId,
        trader.capabilityId,
        config.clockId,
        proposalIdBytes,
        expiresAtMs,
      );
      deps.log(`[analyst] Pending lock set: proposalId=${proposalId}`);

      return {
        ok: true,
        status: 'processed',
        intentId: ctx.intentId,
        aerDigest: execResp.txDigest,
        summary,
        proposal,
      };
    } catch (err) {
      // Non-fatal: if onchain lock fails, still return the AER result without
      // the proposal so the chat-server sends a plain text response.
      deps.log(`[analyst] setPendingProposal failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    ok: true,
    status: 'processed',
    intentId: ctx.intentId,
    aerDigest: execResp.txDigest,
    summary,
  };
}
