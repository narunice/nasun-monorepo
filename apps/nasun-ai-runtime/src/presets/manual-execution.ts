/**
 * Manual execution preset (Plan D §D-5).
 *
 * Triggered by `trigger_type=manual` when the user taps [Confirm] on an
 * analyst-proposed trade in the Telegram inline keyboard. The chat-server
 * serialises the pending Proposal JSON into ctx.message.
 *
 * Flow:
 *   1. Parse Proposal from ctx.message
 *   2. isPendingActive guard (abort if lock already gone -- race/replay)
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
 * The pending lock is cleared in a finally-style block once isPendingActive
 * has passed. From the user's POV the proposal is "done" whether the swap
 * settled, the boundary rejected it, or any later step failed -- leaving the
 * lock in place would block all subsequent analyst/heartbeat cycles for up
 * to 15 minutes (the on-chain TTL). Stranded locks were the root cause of
 * the 2026-05-16 "agent stops responding after a failed Confirm" incident.
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
} from '../nasun-ai-client.js';
import {
  infer as defaultInfer,
  executeCapability as defaultExecuteCapability,
} from '../host-client.js';
import {
  signSettle,
  canonicalJsonSha256,
  computeActionCallHash,
  ZERO_ACTION_CALL_HASH,
} from '../sig.js';
import { escrow as escrowSdk } from '@nasun/baram-sdk';
import {
  TRADER_CONFIG,
  buildSwapActionCall as defaultBuildSwapActionCall,
  quoteMinOut as defaultQuoteMinOut,
  quoteBaseInForQuoteOut as defaultQuoteBaseInForQuoteOut,
  fetchEscrowAssetBalance as defaultFetchEscrowAssetBalance,
  dailySpentQuoteRaw as defaultDailySpentQuoteRaw,
} from './trader.js';
import { fetchCapabilityFields as defaultFetchCapabilityFields } from './trader-cycle.js';
import {
  buildTradeSwapEnvelope,
  buildReplay,
} from './trader-envelope.js';
import type { Config } from '../config.js';
import type { WakeContext, WakeOutcome } from '../wake-router.js';
import { recordAerLanded } from '../aer-heartbeat.js';
import {
  fetchTradeFills,
  fetchEscrowBalances,
  formatHeartbeatHtml,
  reconcileBalancesWithFills,
} from '../notify.js';

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
  fetchCapabilityFields: typeof defaultFetchCapabilityFields;
  buildSwapActionCall: typeof defaultBuildSwapActionCall;
  quoteMinOut: typeof defaultQuoteMinOut;
  quoteBaseInForQuoteOut: typeof defaultQuoteBaseInForQuoteOut;
  fetchEscrowAssetBalance: typeof defaultFetchEscrowAssetBalance;
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
  fetchCapabilityFields: defaultFetchCapabilityFields,
  buildSwapActionCall: defaultBuildSwapActionCall,
  quoteMinOut: defaultQuoteMinOut,
  quoteBaseInForQuoteOut: defaultQuoteBaseInForQuoteOut,
  fetchEscrowAssetBalance: defaultFetchEscrowAssetBalance,
  dailySpentQuoteRaw: defaultDailySpentQuoteRaw,
  log: (msg) => {
    const ts = new Date().toLocaleString('en-US');
    console.log(`[${ts}] ${msg}`);
  },
  nowIso: () => new Date().toISOString(),
};

/** Cached escrow + capability initial shared versions (immutable post-creation). */
let cachedEscrowVersion: bigint | null = null;
let cachedCapabilityInitialSharedVersion: bigint | null = null;

export async function runManualExecution(
  client: SuiClient,
  config: Config,
  ctx: WakeContext,
  depsIn: Partial<ManualExecutionDeps> = {},
): Promise<WakeOutcome> {
  const deps: ManualExecutionDeps = { ...REAL_DEPS, ...depsIn };
  const trader = config.trader;

  if (!trader) {
    deps.log('[manual] Trader config not set -- cannot run manual execution.');
    return { ok: false, status: 'rejected', reason: 'trader_config_missing' };
  }

  // PR1.A: swap execution path is disabled at the platform level until the
  // 6-call atomic PTB lands in PR1.5. Trader cycle never produces a proposal
  // (BUY/SELL is demoted to HOLD upstream), so this short-circuit is mostly
  // defensive -- it stops a stale chat-server confirmation from re-entering
  // the deleted swap path. Operators can flip PR1A_SWAP_DISABLED=false when
  // PR1.5 ships.
  if ((process.env.PR1A_SWAP_DISABLED ?? 'true') !== 'false') {
    deps.log('[manual] PR1.A swap-disabled -- rejecting manual execution wake.');
    return { ok: false, status: 'rejected', reason: 'pr1a_swap_disabled' };
  }

  // 1. Parse Proposal from ctx.message. A cancel sentinel
  // ({"__nasun_cancel__": true, "proposal_id": "..."}) routes to the
  // lock-clear-only path below; otherwise the body is a full Proposal.
  let proposal: Proposal;
  let isCancel = false;
  let cancelProposalId: string | null = null;
  try {
    if (!ctx.message) throw new Error('message is empty');
    const parsed = JSON.parse(ctx.message) as Record<string, unknown>;
    if (parsed.__nasun_cancel__ === true) {
      isCancel = true;
      cancelProposalId = typeof parsed.proposal_id === 'string' ? parsed.proposal_id : null;
      // Synthesise a placeholder so downstream code paths that never run
      // for cancel still type-check. None of its fields are read on the
      // cancel branch.
      proposal = { proposal_id: cancelProposalId ?? '' } as Proposal;
    } else {
      proposal = parsed as unknown as Proposal;
      if (!proposal.proposal_id || !proposal.side || !proposal.size_quote_raw) {
        throw new Error('proposal missing required fields');
      }
    }
  } catch (err) {
    deps.log(`[manual] Failed to parse proposal from message: ${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 'rejected', reason: 'invalid_proposal_message' };
  }

  if (isCancel) {
    deps.log(`[manual] Cancel signal received for proposal=${cancelProposalId ?? 'n/a'} -- clearing pending lock.`);
    if (!config.baramAerPackageId) {
      return { ok: true, status: 'processed', summary: 'Proposal cancelled.' };
    }
    try {
      const digest = await deps.clearPendingProposal(
        client,
        config.keypair,
        config.baramAerPackageId,
        trader.capabilityId,
        config.clockId,
      );
      deps.log(`[manual] Pending lock cleared (cancel): ${digest}`);
    } catch (err) {
      // E_NO_PENDING_PROPOSAL is the expected outcome when the lock has
      // already expired or been cleared by a prior cycle -- treat as success.
      const msg = err instanceof Error ? err.message : String(err);
      deps.log(`[manual] clearPendingProposal (cancel) reported: ${msg}`);
    }
    return { ok: true, status: 'processed', summary: 'Proposal cancelled.' };
  }

  deps.log(`[manual] Executing confirmed proposal: ${proposal.side} ${(Number(proposal.size_quote_raw) / 1e6).toFixed(2)} NUSDC (${proposal.proposal_id})`);

  // 2. isPendingActive guard. If the lock is gone (expired or already cleared),
  //    do not execute -- the proposal may have been cancelled or already executed.
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
      deps.log('[manual] Pending lock is not active -- proposal may have expired or been cleared. Aborting.');
      return { ok: false, status: 'rejected', reason: 'pending_lock_not_active' };
    }
  }

  // From here on, the on-chain pending lock is known to be active. Any exit
  // path -- success, validation failure, infer failure, swap failure -- must
  // release the lock; otherwise the next analyst/heartbeat cycle will skip
  // for up to 15 minutes (the on-chain TTL). Wrap the rest in try/finally.
  let lockReleased = false;
  const releaseLock = async (label: string) => {
    if (lockReleased) return;
    lockReleased = true;
    if (!config.baramAerPackageId) return;
    try {
      const digest = await deps.clearPendingProposal(
        client,
        config.keypair,
        config.baramAerPackageId,
        trader.capabilityId,
        config.clockId,
      );
      deps.log(`[manual] Pending lock cleared (${label}): ${digest}`);
    } catch (err) {
      // Non-fatal: the lock auto-expires at the on-chain TTL anyway. Log so
      // operators can see the lock survived this cycle.
      deps.log(`[manual] clearPendingProposal failed (non-fatal, ${label}): ${err instanceof Error ? err.message : err}`);
    }
  };

  try {
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
  let promptHashHex: string;
  try {
    const req = await deps.createRequest(client, config.keypair, config, prompt, 'ai_inference');
    requestId = req.requestId;
    promptHashHex = req.promptHashHex;
    deps.log(`[manual] On-chain request created: requestId=${requestId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const { message, fatal } = categorizeError(msg);
    deps.log(`[manual] Request creation failed: ${message}`);
    return { ok: false, status: 'rejected', reason: `request_failed: ${message}`, ...(fatal ? {} : {}) };
  }

  // 5a. Snapshot capability owner+version (same pattern as trader-cycle).
  const principalAddressMe = trader.walletAddress.toLowerCase();
  const agentAddressMe = config.agentAddress.toLowerCase();
  let expectedCapabilityVersionMe: string;
  try {
    const obj = await client.getObject({ id: trader.capabilityId, options: { showContent: true } });
    if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
      throw new Error('capability not found');
    }
    const f = obj.data.content.fields as Record<string, unknown>;
    if (typeof f.owner !== 'string' || typeof f.version !== 'string') {
      throw new Error('capability owner/version missing');
    }
    expectedCapabilityVersionMe = f.version;
    const ownerNormalized = (f.owner as string).toLowerCase().startsWith('0x')
      ? (f.owner as string).toLowerCase()
      : `0x${(f.owner as string).toLowerCase()}`;
    if (ownerNormalized !== principalAddressMe) {
      deps.log(`[manual] capability owner ${ownerNormalized} != trader.walletAddress; aborting.`);
      return { ok: false, status: 'rejected', reason: 'capability_owner_mismatch' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deps.log(`[manual] capability fetch failed: ${msg}`);
    return { ok: false, status: 'rejected', reason: `capability_fetch_failed: ${msg}` };
  }

  // 6. POST /infer.
  const promptHashWireMe = `0x${promptHashHex}`;
  const inferResp = await deps.infer(trader.hostUrl, config.apiKey, {
    requestId,
    prompt,
    model: config.model,
    capabilityId: trader.capabilityId,
    principalAddress: principalAddressMe,
    promptHash: promptHashWireMe,
    expectedCapabilityVersion: expectedCapabilityVersionMe,
  });
  if (!inferResp.success || !inferResp.result || !inferResp.resultHash) {
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

  // 8. Lineage -- parent points to the cognition AER that proposed the trade.
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
  const sizeQuoteRaw = BigInt(proposal.size_quote_raw);
  const inputAssetType =
    proposal.side === 'BUY' ? trader.coinNusdcType : trader.coinNbtcType;
  const outputAssetType =
    proposal.side === 'BUY' ? trader.coinNbtcType : trader.coinNusdcType;

  // SELL: proposal.size_quote_raw is the desired NUSDC quote out, but the
  // swap PTB withdraws BASE (NBTC) from escrow. Convert quote -> base via
  // live pool mid; BUY keeps quote raw as-is (input asset = quote).
  // Pre-flight the escrow balance for a clear `insufficient_escrow_base_balance`
  // reason rather than the opaque on-chain abort 573 mask. See 2026-05-21
  // incident.
  let spendAmountRaw: bigint = sizeQuoteRaw;
  if (proposal.side === 'SELL') {
    try {
      spendAmountRaw = await deps.quoteBaseInForQuoteOut({
        client,
        quoteOutRaw: sizeQuoteRaw,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.log(`[manual] SELL quote->base conversion failed: ${msg}`);
      return { ok: false, status: 'rejected', reason: 'sell_size_conversion_failed' };
    }
    if (spendAmountRaw <= 0n) {
      deps.log('[manual] SELL conversion yielded zero base size; aborting.');
      return { ok: false, status: 'rejected', reason: 'sell_size_zero' };
    }
    try {
      const escrowBaseBalance = await deps.fetchEscrowAssetBalance(
        client,
        trader.escrowId,
        inputAssetType,
      );
      if (escrowBaseBalance < spendAmountRaw) {
        deps.log(
          `[manual] SELL pre-flight: escrow NBTC ${escrowBaseBalance} < required ${spendAmountRaw}; aborting.`,
        );
        return {
          ok: false,
          status: 'rejected',
          reason: 'insufficient_escrow_base_balance',
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      deps.log(`[manual] SELL pre-flight balance read failed: ${msg}`);
      return { ok: false, status: 'rejected', reason: 'escrow_balance_read_failed' };
    }
  }

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
      inputAmount: spendAmountRaw.toString(),
      maxSlippageBps: proposal.max_slippage_bps,
      poolId: TRADER_CONFIG.pool,
    },
  };

  let escrowBlock: {
    objectId: string;
    initialSharedVersion: string;
    capabilityId: string;
    capabilityInitialSharedVersion: string;
  } | null = null;
  let spendBlock: { coinAssetType: string; amount: string } | null = null;
  let actionCallBlock: ReturnType<typeof defaultBuildSwapActionCall> | null = null;

  try {
    if (cachedEscrowVersion === null) {
      const ref = await deps.fetchEscrow(client, trader.escrowId);
      cachedEscrowVersion = ref.initialSharedVersion;
    }
    if (cachedCapabilityInitialSharedVersion === null) {
      const capFields = await deps.fetchCapabilityFields(client, trader.capabilityId);
      cachedCapabilityInitialSharedVersion = BigInt(capFields.initialSharedVersion);
    }
    escrowBlock = {
      objectId: trader.escrowId,
      initialSharedVersion: cachedEscrowVersion.toString(),
      capabilityId: trader.capabilityId,
      capabilityInitialSharedVersion: cachedCapabilityInitialSharedVersion.toString(),
    };
    spendBlock = { coinAssetType: inputAssetType, amount: spendAmountRaw.toString() };
    const minOut = await deps.quoteMinOut({
      client,
      direction: proposal.side,
      sizeInRaw: spendAmountRaw,
      slippageBps: proposal.max_slippage_bps,
    });
    actionCallBlock = deps.buildSwapActionCall({ direction: proposal.side, minOut });
  } catch (err) {
    deps.log(`[manual] Escrow/quote setup failed: ${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 'rejected', reason: 'escrow_setup_failed' };
  }

  // 10. POST /execute-capability (execution AER). actionCallHash is bound to
  // sig2 so the Lambda can recompute and reject any swap-block tamper after
  // the agent signature. HOLD branch is unreachable here (proposal already
  // implies swap) but we fall back to ZERO_ACTION_CALL_HASH defensively.
  const envelopeHashMe = canonicalJsonSha256(envelope);
  const actionCallHashMe =
    actionCallBlock && escrowBlock && spendBlock
      ? computeActionCallHash({
          actionCall: actionCallBlock,
          escrow: escrowBlock,
          spend: spendBlock,
        })
      : ZERO_ACTION_CALL_HASH;
  const sig2Me = await signSettle(config.keypair, {
    v: 1,
    kind: 'nasun-ai-settle',
    requestId: String(requestId),
    promptHash: promptHashWireMe,
    resultHash: inferResp.resultHash,
    agentAddress: agentAddressMe,
    principalAddress: principalAddressMe,
    capabilityId: trader.capabilityId,
    expectedCapabilityVersion: expectedCapabilityVersionMe,
    envelopeHash: envelopeHashMe,
    actionCallHash: actionCallHashMe,
  });
  const execResp = await deps.executeCapability(trader.hostUrl, config.apiKey, {
    requestId,
    promptHash: promptHashWireMe,
    resultHash: inferResp.resultHash,
    result: inferResp.result,
    executionTimeMs: inferResp.executionTimeMs ?? 0,
    model: config.model,
    budgetId: config.budgetId,
    capabilityId: trader.capabilityId,
    agentAddress: agentAddressMe,
    principalAddress: principalAddressMe,
    expectedCapabilityVersion: expectedCapabilityVersionMe,
    envelope,
    lineage,
    wake,
    replay,
    proposal: proposalForExec,
    envelopeHash: envelopeHashMe,
    actionCallHash: actionCallHashMe,
    sig2: sig2Me,
    actionCall: actionCallBlock,
    escrow: escrowBlock,
    spend: spendBlock,
    purpose: `Manual execution of confirmed proposal ${proposal.proposal_id}`,
    ...(trader.agentProfileId ? { agentProfileId: trader.agentProfileId } : {}),
  });

  if (!execResp.success) {
    const reason = execResp.preflightDenied
      ? `preflight: ${execResp.preflightReason ?? 'unknown'}`
      : (execResp.error ?? 'unknown');
    deps.log(`[manual] /execute-capability failed: ${reason}`);
    return { ok: false, status: 'rejected', reason: `execute_failed: ${reason}` };
  }

  deps.log(`[manual] Execution AER landed: digest=${execResp.txDigest ?? 'n/a'}`);
  recordAerLanded();

  // Pending lock cleanup runs in the finally block below.

  // Build a rich HTML summary mirroring the autonomous heartbeat push so the
  // user sees identical formatting (header, fills, live escrow balances, View
  // tx / View escrow links) on both surfaces. The chat-server side sends the
  // returned summary verbatim with parse_mode='HTML', so the same formatter
  // can power both paths. Any RPC/format failure degrades to a plain summary —
  // we never want a presentation bug to make a settled trade look failed.
  let summaryHtml: string;
  try {
    let fills: Awaited<ReturnType<typeof fetchTradeFills>> = null;
    if (execResp.txDigest) {
      fills = await fetchTradeFills(config.rpcUrl, execResp.txDigest, fetch);
    }
    const balancesRaw = await fetchEscrowBalances(config.rpcUrl, trader.escrowId, fetch);
    // Same RPC indexer-lag mitigation as the autonomous push: if escrow
    // dynamic field's previousTransaction doesn't match the just-settled
    // tx digest, apply the fills delta to render the post-trade state.
    const balances = reconcileBalancesWithFills(balancesRaw, fills, execResp.txDigest);
    const syntheticResult = {
      outcome: 'succeeded' as const,
      txDigest: execResp.txDigest,
      decision: {
        action: proposal.side as 'BUY' | 'SELL',
        sizeNUSDC: Number(proposal.size_quote_raw) / 1e6,
        reason: `User-confirmed: ${proposal.summary}`,
      },
    };
    summaryHtml = formatHeartbeatHtml(
      syntheticResult,
      trader.strategy.id,
      'https://explorer.nasun.io/devnet',
      {
        fills,
        agentName: process.env.AGENT_NAME,
        balances,
        escrowId: trader.escrowId,
      },
    );
  } catch (err) {
    deps.log(`[manual] summary enrichment failed (non-fatal): ${err instanceof Error ? err.message : err}`);
    summaryHtml = `Executed ${proposal.side} ~${(Number(proposal.size_quote_raw) / 1e6).toFixed(2)} NUSDC (confirmed). ${fakeDecision.reason}`;
  }

  return {
    ok: true,
    status: 'processed',
    intentId: confirmIntentId,
    aerDigest: execResp.txDigest,
    summary: summaryHtml,
  };
  } finally {
    await releaseLock('post-exec');
  }
}
