/**
 * Manual execution preset (Plan D §D-5).
 *
 * Triggered by `trigger_type=manual` when the user taps [Confirm] on an
 * analyst-proposed trade in the Telegram inline keyboard. The chat-server
 * serialises the pending Proposal JSON into ctx.message.
 *
 * Flow:
 *   1. Parse Proposal from ctx.message
 *   2. isPendingActive guard (abort if lock already gone — race/replay)
 *   3. Budget check
 *   4. Build a minimal confirmation prompt (LLM re-confirms the direction)
 *   5. createRequest (budget deduction)
 *   6. POST /infer to obtain spend token
 *   7. Build execution envelope (trade.swap.v1, outcome=success/failure)
 *   8. Build lineage: parent_intent_id = ctx.parentIntentId ?? proposal.intent_id
 *   9. Build escrow + actionCall
 *  10. POST /execute-capability (execution AER)
 *  11. clearPendingProposal (onchain)
 *  12. Return WakeOutcome
 *
 * On any failure BEFORE /execute-capability, the pending lock is left intact
 * so the user can retry or let it expire. On /execute-capability failure, the
 * lock is also left intact (the host's preflight might have a transient issue).
 * Once /execute-capability succeeds, the lock is always cleared.
 */

import type { SuiClient } from '@mysten/sui/client';

import {
  intentIdToBytes,
  newIntentId,
  type Proposal,
} from '@nasun/baram-sdk';

import {
  checkBudget as defaultCheckBudget,
  createRequest as defaultCreateRequest,
  isPendingActive as defaultIsPendingActive,
  clearPendingProposal as defaultClearPendingProposal,
  categorizeError,
} from '../baram-client.js';
import {
  infer as defaultInfer,
  executeCapability as defaultExecuteCapability,
} from '../host-client.js';
import { escrow as escrowSdk } from '@nasun/baram-sdk';
import {
  TRADER_CONFIG,
  buildSwapActionCall as defaultBuildSwapActionCall,
  quoteMinOut as defaultQuoteMinOut,
  dailySpentQuoteRaw as defaultDailySpentQuoteRaw,
} from './trader.js';
import {
  buildTradeSwapEnvelope,
  buildReplay,
} from './trader-envelope.js';
import type { Config } from '../config.js';
import type { WakeContext, WakeOutcome } from '../wake-router.js';

// Minimal prompt used for the confirmation LLM call. The user has already
// confirmed the trade direction; we ask the LLM to "endorse" the decision so
// the host's /infer path issues a valid spend token and the AER records an
// LLM-backed attestation that the execution was reviewed by the AI agent.
function buildConfirmPrompt(proposal: Proposal, nowIso: string): string {
  return [
    'You are a financial AI agent executing a user-confirmed trade.',
    '',
    `The user has reviewed and confirmed the following trade proposal:`,
    `- Action: ${proposal.side}`,
    `- Amount: ${(Number(proposal.size_quote_raw) / 1e6).toFixed(6)} NUSDC`,
    `- Symbol: ${proposal.symbol}`,
    `- Original reasoning: ${proposal.summary}`,
    `- Confirmed at: ${nowIso}`,
    '',
    'Confirm execution with the exact same decision.',
    'Respond with exactly this JSON (no markdown, no extra text):',
    `{"action":"${proposal.side}","sizeNUSDC":${(Number(proposal.size_quote_raw) / 1e6).toFixed(6)},"reason":"User-confirmed execution: ${proposal.summary.slice(0, 100)}"}`,
  ].join('\n');
}

export interface ManualExecutionDeps {
  infer: typeof defaultInfer;
  executeCapability: typeof defaultExecuteCapability;
  checkBudget: typeof defaultCheckBudget;
  createRequest: typeof defaultCreateRequest;
  isPendingActive: typeof defaultIsPendingActive;
  clearPendingProposal: typeof defaultClearPendingProposal;
  fetchEscrow: typeof escrowSdk.fetchEscrow;
  buildSwapActionCall: typeof defaultBuildSwapActionCall;
  quoteMinOut: typeof defaultQuoteMinOut;
  dailySpentQuoteRaw: typeof defaultDailySpentQuoteRaw;
  log: (msg: string) => void;
  nowIso: () => string;
}

const REAL_DEPS: ManualExecutionDeps = {
  infer: defaultInfer,
  executeCapability: defaultExecuteCapability,
  checkBudget: defaultCheckBudget,
  createRequest: defaultCreateRequest,
  isPendingActive: defaultIsPendingActive,
  clearPendingProposal: defaultClearPendingProposal,
  fetchEscrow: escrowSdk.fetchEscrow,
  buildSwapActionCall: defaultBuildSwapActionCall,
  quoteMinOut: defaultQuoteMinOut,
  dailySpentQuoteRaw: defaultDailySpentQuoteRaw,
  log: (msg) => {
    const ts = new Date().toLocaleString('en-US');
    console.log(`[${ts}] ${msg}`);
  },
  nowIso: () => new Date().toISOString(),
};

/** Cached escrow initial shared version (stable across restarts). */
let cachedEscrowVersion: bigint | null = null;

export async function runManualExecution(
  client: SuiClient,
  config: Config,
  ctx: WakeContext,
  depsIn: Partial<ManualExecutionDeps> = {},
): Promise<WakeOutcome> {
  const deps: ManualExecutionDeps = { ...REAL_DEPS, ...depsIn };
  const trader = config.trader;

  if (!trader) {
    deps.log('[manual] Trader config not set — cannot run manual execution.');
    return { ok: false, status: 'rejected', reason: 'trader_config_missing' };
  }

  // 1. Parse Proposal from ctx.message.
  let proposal: Proposal;
  try {
    if (!ctx.message) throw new Error('message is empty');
    proposal = JSON.parse(ctx.message) as Proposal;
    if (!proposal.proposal_id || !proposal.side || !proposal.size_quote_raw) {
      throw new Error('proposal missing required fields');
    }
  } catch (err) {
    deps.log(`[manual] Failed to parse proposal from message: ${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 'rejected', reason: 'invalid_proposal_message' };
  }

  deps.log(`[manual] Executing confirmed proposal: ${proposal.side} ${(Number(proposal.size_quote_raw) / 1e6).toFixed(2)} NUSDC (${proposal.proposal_id})`);

  // 2. isPendingActive guard. If the lock is gone (expired or already cleared),
  //    do not execute — the proposal may have been cancelled or already executed.
  if (config.baramAerPackageId) {
    let pending = false;
    try {
      pending = await deps.isPendingActive(
        client,
        config.baramAerPackageId,
        trader.capabilityId,
        ctx.nowMs,
        config.agentAddress,
      );
    } catch (err) {
      deps.log(`[manual] isPendingActive check failed: ${err instanceof Error ? err.message : err}`);
      return { ok: false, status: 'rejected', reason: 'pending_check_failed' };
    }
    if (!pending) {
      deps.log('[manual] Pending lock is not active — proposal may have expired or been cleared. Aborting.');
      return { ok: false, status: 'rejected', reason: 'pending_lock_not_active' };
    }
  }

  // 3. Budget check.
  let budget;
  try {
    budget = await deps.checkBudget(client, config.budgetId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[manual] Budget check failed: ${msg}`);
    return { ok: false, status: 'rejected', reason: `budget_check_failed: ${msg}` };
  }
  if (!budget.isActive) {
    deps.log('[manual] Budget is inactive.');
    return { ok: false, status: 'rejected', reason: 'budget_inactive' };
  }
  if (budget.balance < config.price) {
    deps.log(`[manual] Insufficient balance: ${budget.balance} < ${config.price}.`);
    return { ok: false, status: 'rejected', reason: 'insufficient_balance' };
  }

  // 4. Build confirmation prompt.
  const nowIso = deps.nowIso();
  const prompt = buildConfirmPrompt(proposal, nowIso);
  const dailySpentRaw = deps.dailySpentQuoteRaw();

  // 5. On-chain request (budget deduction).
  let requestId: number;
  try {
    const req = await deps.createRequest(client, config.keypair, config, prompt, 'ai_inference');
    requestId = req.requestId;
    deps.log(`[manual] On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    deps.log(`[manual] Request creation failed: ${message}`);
    return { ok: false, status: 'rejected', reason: `request_failed: ${message}`, ...(fatal ? {} : {}) };
  }

  // 6. POST /infer.
  const inferResp = await deps.infer(trader.hostUrl, config.apiKey, {
    requestId,
    prompt,
    model: config.model,
    capabilityId: trader.capabilityId,
    walletAddress: trader.walletAddress,
  });
  if (!inferResp.success || !inferResp.result || !inferResp.spendToken) {
    const reason = inferResp.preflightDenied
      ? (inferResp.preflightReason ?? 'preflight denied')
      : (inferResp.error ?? 'unknown');
    deps.log(`[manual] /infer failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `infer_failed: ${reason}` };
  }

  // 7. Build execution envelope (trade.swap.v1).
  const fakeDecision = {
    action: proposal.side as 'BUY' | 'SELL',
    sizeNUSDC: Number(proposal.size_quote_raw) / 1e6,
    reason: `User-confirmed: ${proposal.summary}`,
  };
  const envelope = buildTradeSwapEnvelope({ decision: fakeDecision, outcome: 1 });

  // 8. Lineage — parent points to the cognition AER that proposed the trade.
  const confirmIntentId = newIntentId();
  const confirmIntentIdBytes = Array.from(intentIdToBytes(confirmIntentId));
  const parentBytes: number[] | null = ctx.parentIntentId
    ? Array.from(intentIdToBytes(ctx.parentIntentId))
    : Array.from(intentIdToBytes(proposal.intent_id));
  const lineage = {
    intentId: confirmIntentIdBytes,
    parentIntentId: parentBytes,
    executionId: 1,
  };

  // Wake: triggered_by_type=4 (manual), ref=session id.
  const wake = { triggeredByType: 4 as const, triggeredByRef: ctx.sid };

  // Replay: embed proposal hashes for verifiable execution context.
  const marketSnapshot = {
    agent: config.agentAddress,
    dailySpentRaw: dailySpentRaw.toString(),
    nowIso,
    confirmedProposalId: proposal.proposal_id,
  };
  const replay = buildReplay({
    modelVersion: config.model,
    promptText: prompt,
    strategy: trader.strategy,
    marketSnapshot,
    extras: [
      ['confirmed_proposal_id', Buffer.from(proposal.proposal_id, 'utf8') as unknown as Uint8Array],
    ],
  });

  // 9. Build escrow + actionCall.
  const sizeRaw = BigInt(proposal.size_quote_raw);
  const inputAssetType =
    proposal.side === 'BUY' ? trader.coinNusdcType : trader.coinNbtcType;
  const outputAssetType =
    proposal.side === 'BUY' ? trader.coinNbtcType : trader.coinNusdcType;

  const proposalForExec = {
    eventClass: 2 as const,
    actionType: envelope.actionType,
    paymentAmount: String(config.price),
    exec: {
      targetPackage: TRADER_CONFIG.deepbookPackage,
      module: 'pool',
      fn: proposal.side === 'BUY' ? 'swap_exact_quote_for_base' : 'swap_exact_base_for_quote',
      inputAssetType,
      outputAssetType,
      inputAmount: sizeRaw.toString(),
      maxSlippageBps: proposal.max_slippage_bps,
      poolId: TRADER_CONFIG.pool,
    },
  };

  let escrowBlock: { objectId: string; initialSharedVersion: string; capabilityId: string } | null = null;
  let spendBlock: { coinAssetType: string; amount: string } | null = null;
  let actionCallBlock: ReturnType<typeof defaultBuildSwapActionCall> | null = null;

  try {
    if (cachedEscrowVersion === null) {
      const ref = await deps.fetchEscrow(client, trader.escrowId);
      cachedEscrowVersion = ref.initialSharedVersion;
    }
    escrowBlock = {
      objectId: trader.escrowId,
      initialSharedVersion: cachedEscrowVersion.toString(),
      capabilityId: trader.capabilityId,
    };
    spendBlock = { coinAssetType: inputAssetType, amount: sizeRaw.toString() };
    const minOut = await deps.quoteMinOut({
      client,
      direction: proposal.side,
      sizeInRaw: sizeRaw,
      slippageBps: proposal.max_slippage_bps,
    });
    actionCallBlock = deps.buildSwapActionCall({ direction: proposal.side, minOut });
  } catch (err) {
    deps.log(`[manual] Escrow/quote setup failed: ${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 'rejected', reason: 'escrow_setup_failed' };
  }

  // 10. POST /execute-capability (execution AER).
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
    proposal: proposalForExec,
    actionCall: actionCallBlock,
    escrow: escrowBlock,
    spend: spendBlock,
    purpose: `Manual execution of confirmed proposal ${proposal.proposal_id}`,
  });

  if (!execResp.success) {
    const reason = execResp.preflightDenied
      ? `preflight: ${execResp.preflightReason ?? 'unknown'}`
      : (execResp.error ?? 'unknown');
    deps.log(`[manual] /execute-capability failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `execute_failed: ${reason}` };
  }

  deps.log(`[manual] Execution AER landed: digest=${execResp.txDigest ?? 'n/a'}`);

  // 11. clearPendingProposal — always runs after successful execution.
  if (config.baramAerPackageId) {
    try {
      const clearDigest = await deps.clearPendingProposal(
        client,
        config.keypair,
        config.baramAerPackageId,
        trader.capabilityId,
        config.clockId,
      );
      deps.log(`[manual] Pending lock cleared: ${clearDigest}`);
    } catch (err) {
      // Non-fatal: the AER already landed. The lock will self-expire.
      deps.log(`[manual] clearPendingProposal failed (non-fatal, will self-expire): ${err instanceof Error ? err.message : err}`);
    }
  }

  const summaryText = `Executed ${proposal.side} ~${(Number(proposal.size_quote_raw) / 1e6).toFixed(2)} NUSDC (confirmed). ${fakeDecision.reason}`;

  return {
    ok: true,
    status: 'processed',
    intentId: confirmIntentId,
    aerDigest: execResp.txDigest,
    summary: summaryText,
  };
}
