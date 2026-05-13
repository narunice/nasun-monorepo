/**
 * Trader cycle tests (Plan C C3-v2 §5.5).
 *
 * Exercises the two-call /infer + /execute-capability flow end-to-end
 * with all network surfaces mocked. The cycle's pure-function shape
 * (see trader-cycle.ts) lets us assert on:
 *
 *   - envelope reflects FINAL parsed decision (not the provisional HOLD
 *     placeholder the legacy v1 flow used)
 *   - cognition path has no actionCall/escrow/spend in the body
 *   - execution path has actionCall (pipe wiring intact), escrow, spend
 *   - state file split: lastCognitionDigest vs lastExecutionDigest
 *     persist by event class
 *   - escrow.fetchEscrow is called only on first execution AER then cached
 *   - intent chain promotes only on settled cycles (next cycle's
 *     parentIntentId == this cycle's intentId)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import {
  runTraderCycle,
  newTraderCycleRuntime,
  type TraderCycleDeps,
  type TraderState,
} from './trader-cycle.js';
import type { Config } from '../config.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NUSDC_TYPE =
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC';
const NBTC_TYPE =
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC';
const CAP_ID = '0x' + 'aa'.repeat(32);
const ESCROW_ID = '0x' + 'bb'.repeat(32);
const WALLET = '0x' + 'cc'.repeat(32);
const AGENT_ADDR = '0x' + 'dd'.repeat(32);

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    preset: 'trader',
    mode: 'lambda',
    intervalMinutes: 30,
    intervalMs: 30 * 60 * 1000,
    singleCycle: false,
    budgetId: '0x' + '11'.repeat(32),
    price: 100_000, // 0.1 NUSDC raw
    model: 'gpt-4',
    apiKey: 'test-api-key',
    keypair: {} as Config['keypair'],
    agentAddress: AGENT_ADDR,
    rpcUrl: 'http://localhost',
    lambdaUrl: 'http://localhost',
    llmApiUrl: 'http://localhost',
    llmApiKey: 'k',
    llmModel: 'gpt-4',
    trader: {
      hostUrl: 'http://localhost:7474',
      capabilityId: CAP_ID,
      walletAddress: WALLET,
      strategy: {
        id: 'balanced',
        name: 'Balanced',
        description: 'd',
        promptInstructions: '',
      },
      maxNotionalQuoteRaw: 2_000_000n,
      dailyMaxQuoteRaw: 20_000_000n,
      maxSlippageBps: 100,
      escrowId: ESCROW_ID,
      coinNusdcType: NUSDC_TYPE,
      coinNbtcType: NBTC_TYPE,
    },
    ...overrides,
  } as Config;
}

function makeBalances(nbtc = 100_000_000n /* 1 NBTC */, nusdc = 50_000_000n /* 50 NUSDC */) {
  return { nbtcRaw: nbtc, nusdcRaw: nusdc };
}

function makeBudget(balance = 1_000_000_000, active = true) {
  return { balance, totalSpent: 0, requestCount: 0, isActive: active };
}

function makeInferOk(overrides: Record<string, unknown> = {}) {
  return {
    success: true as const,
    result: '{"action":"BUY","sizeNUSDC":1,"reason":"test"}',
    resultHash: 'a'.repeat(64),
    executionTimeMs: 100,
    spendToken: 'token',
    nonce: 'nonce',
    expiresAt: Date.now() + 30_000,
    ...overrides,
  };
}

function makeExecOk(digest = 'DigestForCycle1AAA'.padEnd(43, 'a')) {
  return {
    success: true as const,
    txDigest: digest,
    capabilityVersion: '7',
  };
}

function makeDeps(overrides: Partial<TraderCycleDeps> = {}): Partial<TraderCycleDeps> {
  return {
    infer: vi.fn().mockResolvedValue(makeInferOk()) as unknown as TraderCycleDeps['infer'],
    executeCapability: vi
      .fn()
      .mockResolvedValue(makeExecOk()) as unknown as TraderCycleDeps['executeCapability'],
    checkBudget: vi
      .fn()
      .mockResolvedValue(makeBudget()) as unknown as TraderCycleDeps['checkBudget'],
    createRequest: vi
      .fn()
      .mockResolvedValue({ requestId: 1, promptHashHex: 'h' }) as unknown as TraderCycleDeps['createRequest'],
    fetchEscrow: vi.fn().mockResolvedValue({
      objectId: ESCROW_ID,
      initialSharedVersion: 200n,
      capabilityId: CAP_ID,
    }) as unknown as TraderCycleDeps['fetchEscrow'],
    fetchAgentBalances: vi
      .fn()
      .mockResolvedValue(makeBalances()) as unknown as TraderCycleDeps['fetchAgentBalances'],
    dailySpentQuoteRaw: vi
      .fn()
      .mockReturnValue(0n) as unknown as TraderCycleDeps['dailySpentQuoteRaw'],
    recentTrades: vi.fn().mockReturnValue([]) as unknown as TraderCycleDeps['recentTrades'],
    parseTradeDecision: vi
      .fn()
      .mockReturnValue({ action: 'BUY', sizeNUSDC: 1, reason: 'test' }) as unknown as TraderCycleDeps['parseTradeDecision'],
    buildSwapActionCall: vi.fn().mockReturnValue({
      targetPackage: '0x' + 'ee'.repeat(32),
      module: 'pool',
      fn: 'swap_exact_quote_for_base',
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      args: [
        { kind: 'object', id: '0x' + 'ff'.repeat(32) },
        { kind: 'pipe', from: 'withdraw_coin' },
        { kind: 'pipe', from: 'zero_deep' },
        { kind: 'pure', bytes: 'AAAAAAAAAAA=' },
        { kind: 'object', id: '0x6' },
      ],
    }) as unknown as TraderCycleDeps['buildSwapActionCall'],
    saveState: vi.fn() as unknown as TraderCycleDeps['saveState'],
    log: vi.fn() as unknown as TraderCycleDeps['log'],
    nowIso: () => '2026-05-13T00:00:00.000Z',
    ...overrides,
  };
}

// Cast helper for tests reading mock.calls off injected deps.
function asMock(fn: unknown): ReturnType<typeof vi.fn> {
  return fn as unknown as ReturnType<typeof vi.fn>;
}

const FAKE_CLIENT = {} as SuiClient;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runTraderCycle — execution path (BUY)', () => {
  it('emits eventClass=2 with FINAL parsed decision (not provisional HOLD)', async () => {
    const deps = makeDeps();
    const runtime = newTraderCycleRuntime({
      lastCognitionDigest: null,
      lastExecutionDigest: null,
      lastIntentIdHex: null,
    });

    const result = await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    expect(result.outcome).toBe('succeeded');
    expect(result.finalEventClass).toBe(2);
    expect(deps.executeCapability).toHaveBeenCalledTimes(1);
    // Foundation 결정 1 (canonical execution ledger): the envelope must
    // be built AFTER /infer + parseTradeDecision so it reflects the
    // final LLM-derived decision. A regression that builds the
    // envelope from a provisional HOLD shape would still pass shape
    // assertions; assert invocation order to catch that class.
    const inferOrder = asMock(deps.infer).mock.invocationCallOrder[0];
    const parseOrder = asMock(deps.parseTradeDecision).mock.invocationCallOrder[0];
    const executeOrder = asMock(deps.executeCapability).mock.invocationCallOrder[0];
    expect(inferOrder).toBeLessThan(parseOrder);
    expect(parseOrder).toBeLessThan(executeOrder);
    const [, , body] = asMock(deps.executeCapability).mock.calls[0];
    // Envelope reflects BUY, not HOLD.
    expect(body.envelope.eventClass).toBe(2);
    expect(body.envelope.actionSummary).toMatch(/BUY/);
    // payloadBytes carries the analysis.v1 BCS encoding. First byte is
    // the decision tag: 1=BUY, 2=SELL, 3=HOLD (see encodeAnalysisV1).
    // If the envelope was built from the provisional HOLD shape (the
    // legacy bug), the tag byte would be 3 instead of 1.
    expect(body.envelope.payloadBytes[0]).toBe(1);
    // Proposal mirrors envelope.
    expect(body.proposal.eventClass).toBe(2);
    expect(body.proposal.actionType).toBe(body.envelope.actionType);
    expect(body.proposal.exec).toBeDefined();
    expect(body.proposal.exec.fn).toBe('swap_exact_quote_for_base');
    expect(body.proposal.exec.inputAssetType).toBe(NUSDC_TYPE);
    expect(body.proposal.exec.outputAssetType).toBe(NBTC_TYPE);
    expect(body.proposal.exec.maxSlippageBps).toBe(100);
  });

  it('attaches actionCall + escrow + spend with NUSDC input', async () => {
    const deps = makeDeps();
    const runtime = newTraderCycleRuntime();

    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    const [, , body] = asMock(deps.executeCapability).mock.calls[0];
    expect(body.actionCall).toBeTruthy();
    expect(body.actionCall.fn).toBe('swap_exact_quote_for_base');
    // pipe wiring: arg[1]=withdraw_coin, arg[2]=zero_deep
    expect(body.actionCall.args[1]).toEqual({ kind: 'pipe', from: 'withdraw_coin' });
    expect(body.actionCall.args[2]).toEqual({ kind: 'pipe', from: 'zero_deep' });
    expect(body.escrow).toEqual({
      objectId: ESCROW_ID,
      initialSharedVersion: '200',
      capabilityId: CAP_ID,
    });
    expect(body.spend.coinAssetType).toBe(NUSDC_TYPE);
    expect(body.spend.amount).toBe('1000000'); // 1 NUSDC * 1e6
  });

  it('updates lastExecutionDigest and leaves lastCognitionDigest untouched on settle', async () => {
    const EXEC_DIGEST = 'ExecDigestCycle1' + 'a'.repeat(27);
    const deps = makeDeps({
      executeCapability: vi
        .fn()
        .mockResolvedValue(makeExecOk(EXEC_DIGEST)) as unknown as TraderCycleDeps['executeCapability'],
    });
    const runtime = newTraderCycleRuntime({
      lastCognitionDigest: 'COG_PREV',
      lastExecutionDigest: null,
      lastIntentIdHex: null,
    });

    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    expect(runtime.state.lastCognitionDigest).toBe('COG_PREV');
    expect(runtime.state.lastExecutionDigest).toBe(EXEC_DIGEST);
    const lastSave = asMock(deps.saveState).mock.calls.at(-1)![0] as TraderState;
    expect(lastSave.lastCognitionDigest).toBe('COG_PREV');
    expect(lastSave.lastExecutionDigest).toBe(EXEC_DIGEST);
  });
});

describe('runTraderCycle — execution path (SELL)', () => {
  it('flips input/output assets and fn name when decision is SELL', async () => {
    const deps = makeDeps({
      parseTradeDecision: vi
        .fn()
        .mockReturnValue({ action: 'SELL', sizeNUSDC: 0.5, reason: 's' }),
      buildSwapActionCall: vi.fn().mockReturnValue({
        targetPackage: '0x' + 'ee'.repeat(32),
        module: 'pool',
        fn: 'swap_exact_base_for_quote',
        typeArguments: [NBTC_TYPE, NUSDC_TYPE],
        args: [
          { kind: 'object', id: '0x' + 'ff'.repeat(32) },
          { kind: 'pipe', from: 'withdraw_coin' },
          { kind: 'pipe', from: 'zero_deep' },
          { kind: 'pure', bytes: 'AAAAAAAAAAA=' },
          { kind: 'object', id: '0x6' },
        ],
      }),
    });

    const result = await runTraderCycle(
      FAKE_CLIENT,
      makeConfig(),
      newTraderCycleRuntime(),
      deps,
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.finalEventClass).toBe(2);
    const [, , body] = asMock(deps.executeCapability).mock.calls[0];
    expect(body.proposal.exec.fn).toBe('swap_exact_base_for_quote');
    expect(body.proposal.exec.inputAssetType).toBe(NBTC_TYPE);
    expect(body.proposal.exec.outputAssetType).toBe(NUSDC_TYPE);
    expect(body.spend.coinAssetType).toBe(NBTC_TYPE);
  });
});

describe('runTraderCycle — cognition path (HOLD)', () => {
  it('emits eventClass=1 with no actionCall/escrow/spend in body', async () => {
    const deps = makeDeps({
      parseTradeDecision: vi
        .fn()
        .mockReturnValue({ action: 'HOLD', sizeNUSDC: 0, reason: 'wait' }),
    });

    const result = await runTraderCycle(
      FAKE_CLIENT,
      makeConfig(),
      newTraderCycleRuntime(),
      deps,
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.finalEventClass).toBe(1);
    const [, , body] = asMock(deps.executeCapability).mock.calls[0];
    expect(body.envelope.eventClass).toBe(1);
    expect(body.proposal.eventClass).toBe(1);
    expect(body.proposal.exec).toBeUndefined();
    expect(body.actionCall).toBeNull();
    // trader-cycle passes null (not omitted) so the host route can
    // distinguish "intentionally cognition" from "missing field bug".
    expect(body.escrow).toBeNull();
    expect(body.spend).toBeNull();
    // HOLD must not fetch the escrow.
    expect(deps.fetchEscrow).not.toHaveBeenCalled();
  });

  it('updates lastCognitionDigest and leaves lastExecutionDigest untouched on settle', async () => {
    const deps = makeDeps({
      parseTradeDecision: vi
        .fn()
        .mockReturnValue({ action: 'HOLD', sizeNUSDC: 0, reason: 'w' }),
      executeCapability: vi.fn().mockResolvedValue(makeExecOk('CognitionDigest1')),
    });
    const runtime = newTraderCycleRuntime({
      lastCognitionDigest: null,
      lastExecutionDigest: 'EXEC_PREV',
      lastIntentIdHex: null,
    });

    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    expect(runtime.state.lastCognitionDigest).toBe('CognitionDigest1');
    expect(runtime.state.lastExecutionDigest).toBe('EXEC_PREV');
  });
});

describe('runTraderCycle — failure modes', () => {
  it('does not call /execute-capability when /infer fails', async () => {
    const deps = makeDeps({
      infer: vi.fn().mockResolvedValue({ success: false, error: 'enclave down' }),
    });

    const result = await runTraderCycle(
      FAKE_CLIENT,
      makeConfig(),
      newTraderCycleRuntime(),
      deps,
    );

    expect(result.outcome).toBe('infer_failed');
    expect(deps.executeCapability).not.toHaveBeenCalled();
    // No state save on /infer failure (intent never opened).
    expect(deps.saveState).not.toHaveBeenCalled();
  });

  it('persists intent (without promoting it) when /execute-capability fails', async () => {
    const deps = makeDeps({
      executeCapability: vi.fn().mockResolvedValue({ success: false, error: 'cap revoked' }),
    });
    const runtime = newTraderCycleRuntime({
      lastCognitionDigest: 'COG_PREV',
      lastExecutionDigest: 'EXEC_PREV',
      lastIntentIdHex: null,
    });

    const result = await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    expect(result.outcome).toBe('execute_failed');
    // Digests unchanged.
    expect(runtime.state.lastCognitionDigest).toBe('COG_PREV');
    expect(runtime.state.lastExecutionDigest).toBe('EXEC_PREV');
    // But saveState was called with a fresh intentIdHex (so we don't lose
    // the cycle's intent context for the next run).
    expect(deps.saveState).toHaveBeenCalled();
    const lastSave = (deps.saveState as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as TraderState;
    expect(lastSave.lastIntentIdHex).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns budget_inactive fatal when budget is paused', async () => {
    const deps = makeDeps({
      checkBudget: vi.fn().mockResolvedValue(makeBudget(0, false)),
    });

    const result = await runTraderCycle(
      FAKE_CLIENT,
      makeConfig(),
      newTraderCycleRuntime(),
      deps,
    );

    expect(result.outcome).toBe('budget_inactive');
    expect(result.fatal).toBe(true);
    expect(deps.infer).not.toHaveBeenCalled();
  });

  it('persists intentIdHex (not digests) when parseTradeDecision throws', async () => {
    const deps = makeDeps({
      parseTradeDecision: vi.fn().mockImplementation(() => {
        throw new Error('malformed JSON from LLM');
      }),
    });
    const runtime = newTraderCycleRuntime({
      lastCognitionDigest: 'COG_PREV',
      lastExecutionDigest: 'EXEC_PREV',
      lastIntentIdHex: null,
    });

    const result = await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    expect(result.outcome).toBe('parse_failed');
    // Digests untouched (no AER landed).
    expect(runtime.state.lastCognitionDigest).toBe('COG_PREV');
    expect(runtime.state.lastExecutionDigest).toBe('EXEC_PREV');
    // But intent was opened and is persisted so the next cycle's
    // executionId continues correctly.
    expect(deps.saveState).toHaveBeenCalled();
    const lastSave = asMock(deps.saveState).mock.calls.at(-1)![0] as TraderState;
    expect(lastSave.lastIntentIdHex).toMatch(/^[0-9a-f]{32}$/);
    expect(lastSave.lastCognitionDigest).toBe('COG_PREV');
    expect(lastSave.lastExecutionDigest).toBe('EXEC_PREV');
    // /execute-capability must not be called when parse fails.
    expect(deps.executeCapability).not.toHaveBeenCalled();
  });

  it('demotes BUY to HOLD when parseTradeDecision sets riskGate', async () => {
    const deps = makeDeps({
      parseTradeDecision: vi.fn().mockReturnValue({
        action: 'HOLD',
        sizeNUSDC: 0,
        reason: 'orig BUY',
        riskGate: 'daily cap exhausted',
      }),
    });

    const result = await runTraderCycle(
      FAKE_CLIENT,
      makeConfig(),
      newTraderCycleRuntime(),
      deps,
    );

    expect(result.outcome).toBe('succeeded');
    expect(result.finalEventClass).toBe(1);
    const [, , body] = asMock(deps.executeCapability).mock.calls[0];
    expect(body.envelope.eventClass).toBe(1);
    expect(body.actionCall).toBeNull();
  });
});

describe('runTraderCycle — escrow caching + intent chain', () => {
  it('fetchEscrow is called once even across two BUY cycles', async () => {
    const deps = makeDeps();
    const runtime = newTraderCycleRuntime();

    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);
    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    expect(deps.fetchEscrow).toHaveBeenCalledTimes(1);
    expect(deps.executeCapability).toHaveBeenCalledTimes(2);
  });

  it('cycle 2 lineage.parentIntentId equals cycle 1 lineage.intentId on settle', async () => {
    const deps = makeDeps();
    const runtime = newTraderCycleRuntime();

    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);
    await runTraderCycle(FAKE_CLIENT, makeConfig(), runtime, deps);

    const cycle1Body = asMock(deps.executeCapability).mock.calls[0][2];
    const cycle2Body = asMock(deps.executeCapability).mock.calls[1][2];
    expect(cycle2Body.lineage.parentIntentId).toEqual(cycle1Body.lineage.intentId);
    // executionId resets to 1 after a settle (intent commit).
    expect(cycle2Body.lineage.executionId).toBe(1);
  });
});
