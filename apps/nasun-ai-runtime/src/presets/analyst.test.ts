/**
 * Analyst preset tests (Plan D D-4).
 *
 * Exercises the cognition-only cycle with all network surfaces mocked.
 * Key assertions:
 *
 *   - Always emits analysis.v1 envelope with outcome=hold-noop (2)
 *     regardless of LLM BUY/SELL/HOLD decision
 *   - Lineage uses ctx.intentId ULID bytes (not a freshly generated id)
 *   - parentIntentId carried when ctx.parentIntentId is set
 *   - wake.triggeredByType=2, triggeredByRef=ctx.sid
 *   - Skips and returns pending_lock when isPendingActive returns true
 *   - Rejects on missing trader config, inactive budget, infer failure
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SuiClient } from '@mysten/sui/client';
import { intentIdToBytes, newIntentId } from '@nasun/baram-sdk';

import { runAnalystPreset, type AnalystDeps } from './analyst.js';
import type { Config } from '../config.js';
import type { WakeContext } from '../wake-router.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NUSDC_TYPE =
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC';
const NBTC_TYPE =
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC';
const CAP_ID = '0x' + 'aa'.repeat(32);
const WALLET = '0x' + 'cc'.repeat(32);
const AGENT_ADDR = '0x' + 'dd'.repeat(32);
const AER_PKG_ID = '0x' + 'ae'.repeat(32);

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    preset: 'trader',
    mode: 'lambda',
    intervalMinutes: 30,
    intervalMs: 30 * 60 * 1000,
    singleCycle: false,
    budgetId: '0x' + '11'.repeat(32),
    price: 100_000,
    model: 'llama-3.3-70b-versatile',
    apiKey: 'test-api-key',
    keypair: {} as Config['keypair'],
    agentAddress: AGENT_ADDR,
    rpcUrl: 'http://localhost',
    lambdaUrl: 'http://localhost',
    llmApiUrl: '',
    llmApiKey: '',
    llmModel: '',
    baramAerPackageId: AER_PKG_ID,
    telegramBotToken: null,
    telegramChatId: null,
    wakePort: 0,
    packageId: '0x' + '22'.repeat(32),
    registryId: '0x' + '33'.repeat(32),
    clockId: '0x6',
    executorAddress: '0x' + '44'.repeat(32),
    category: 'ai_inference',
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
      escrowId: '0x' + 'bb'.repeat(32),
      coinNusdcType: NUSDC_TYPE,
      coinNbtcType: NBTC_TYPE,
    },
    ...overrides,
  } as Config;
}

function makeCtx(overrides: Partial<WakeContext> = {}): WakeContext {
  return {
    jobId: newIntentId(),
    triggerType: 'user_message',
    intentId: newIntentId(),
    parentIntentId: undefined,
    sid: 'session-uuid-1234',
    message: 'Should I buy more NBTC now?',
    nowMs: Date.now(),
    ...overrides,
  };
}

function makeInferOk(action = 'HOLD') {
  return {
    success: true as const,
    result: JSON.stringify({ action, sizeNUSDC: action === 'HOLD' ? 0 : 1, reason: 'test reason' }),
    resultHash: 'a'.repeat(64),
    executionTimeMs: 100,
    spendToken: 'spend-token',
    nonce: 'nonce-val',
    expiresAt: Date.now() + 30_000,
  };
}

function makeExecOk(digest = 'CognitionDigestAAA'.padEnd(43, 'a')) {
  return { success: true as const, txDigest: digest, capabilityVersion: '3' };
}

function makeDeps(overrides: Partial<AnalystDeps> = {}): Partial<AnalystDeps> {
  return {
    checkBudget: vi.fn().mockResolvedValue({ balance: 1_000_000_000, totalSpent: 0, requestCount: 0, isActive: true }),
    createRequest: vi.fn().mockResolvedValue({ requestId: 42, promptHashHex: 'h' }),
    isPendingActive: vi.fn().mockResolvedValue(false),
    fetchAgentBalances: vi.fn().mockResolvedValue({ nbtcRaw: 100_000_000n, nusdcRaw: 50_000_000n }),
    dailySpentQuoteRaw: vi.fn().mockReturnValue(0n),
    recentTrades: vi.fn().mockReturnValue([]),
    infer: vi.fn().mockResolvedValue(makeInferOk('HOLD')),
    executeCapability: vi.fn().mockResolvedValue(makeExecOk()),
    parseTradeDecision: vi.fn().mockReturnValue({ action: 'HOLD', sizeNUSDC: 0, reason: 'spread is wide' }),
    log: vi.fn(),
    nowIso: () => '2026-05-13T00:00:00.000Z',
    ...overrides,
  };
}

const FAKE_CLIENT = {} as SuiClient;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAnalystPreset — envelope invariants', () => {
  it('always emits analysis.v1 with outcome=hold-noop even when LLM says BUY', async () => {
    const deps = makeDeps({
      parseTradeDecision: vi.fn().mockReturnValue({ action: 'BUY', sizeNUSDC: 1, reason: 'bullish' }),
    });
    const ctx = makeCtx();
    const result = await runAnalystPreset(FAKE_CLIENT, makeConfig(), ctx, deps);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('processed');

    const execCall = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0];
    const req = execCall[2];
    expect(req.envelope.eventClass).toBe(1);
    expect(req.envelope.actionType).toBe('analysis.v1');
    expect(req.envelope.actionOutcome).toBe(2);
  });

  it('passes actionCall=null and no escrow in execute request', async () => {
    const deps = makeDeps();
    await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(req.actionCall).toBeNull();
    expect(req.escrow).toBeUndefined();
    expect(req.spend).toBeUndefined();
  });
});

describe('runAnalystPreset — lineage', () => {
  it('lineage.intentId matches ctx.intentId ULID bytes', async () => {
    const deps = makeDeps();
    const intentId = newIntentId();
    const ctx = makeCtx({ intentId });
    await runAnalystPreset(FAKE_CLIENT, makeConfig(), ctx, deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    const expected = Array.from(intentIdToBytes(intentId));
    expect(req.lineage.intentId).toEqual(expected);
  });

  it('lineage.parentIntentId is null when ctx.parentIntentId is absent', async () => {
    const deps = makeDeps();
    const ctx = makeCtx({ parentIntentId: undefined });
    await runAnalystPreset(FAKE_CLIENT, makeConfig(), ctx, deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(req.lineage.parentIntentId).toBeNull();
  });

  it('lineage.parentIntentId carries parent ULID bytes when ctx.parentIntentId is set', async () => {
    const deps = makeDeps();
    const parentId = newIntentId();
    const ctx = makeCtx({ parentIntentId: parentId });
    await runAnalystPreset(FAKE_CLIENT, makeConfig(), ctx, deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    const expected = Array.from(intentIdToBytes(parentId));
    expect(req.lineage.parentIntentId).toEqual(expected);
  });

  it('lineage.executionId is 1 for the first analyst call', async () => {
    const deps = makeDeps();
    await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(req.lineage.executionId).toBe(1);
  });
});

describe('runAnalystPreset — wake metadata', () => {
  it('wake.triggeredByType=2 (user_message) and triggeredByRef=sid', async () => {
    const deps = makeDeps();
    const sid = 'my-session-id-xyz';
    const ctx = makeCtx({ sid });
    await runAnalystPreset(FAKE_CLIENT, makeConfig(), ctx, deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(req.wake.triggeredByType).toBe(2);
    expect(req.wake.triggeredByRef).toBe(sid);
  });
});

describe('runAnalystPreset — replay metadata', () => {
  it('replay has modelVersion, non-empty promptTemplateHash, and marketSnapshotHash', async () => {
    const deps = makeDeps();
    await runAnalystPreset(FAKE_CLIENT, makeConfig({ model: 'llama-3.3-70b-versatile' }), makeCtx(), deps);

    const req = (deps.executeCapability as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(req.replay.modelVersion).toBe('llama-3.3-70b-versatile');
    expect(req.replay.promptTemplateHash).toHaveLength(32);
    expect(req.replay.marketSnapshotHash).toHaveLength(32);
  });
});

describe('runAnalystPreset — pending lock', () => {
  it('returns skipped with reason=pending_lock when isPendingActive=true', async () => {
    const deps = makeDeps({
      isPendingActive: vi.fn().mockResolvedValue(true),
    });
    const result = await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('pending_lock');
    expect(deps.infer).not.toHaveBeenCalled();
    expect(deps.executeCapability).not.toHaveBeenCalled();
  });

  it('proceeds normally when isPendingActive=false', async () => {
    const deps = makeDeps({
      isPendingActive: vi.fn().mockResolvedValue(false),
    });
    const result = await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('processed');
  });

  it('skips isPendingActive call when baramAerPackageId is empty', async () => {
    const deps = makeDeps();
    await runAnalystPreset(FAKE_CLIENT, makeConfig({ baramAerPackageId: '' }), makeCtx(), deps);

    expect(deps.isPendingActive).not.toHaveBeenCalled();
  });
});

describe('runAnalystPreset — failure modes', () => {
  it('rejects when trader config is null', async () => {
    const deps = makeDeps();
    const config = makeConfig({ trader: null } as Partial<Config>);
    const result = await runAnalystPreset(FAKE_CLIENT, config, makeCtx(), deps);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('trader_config_missing');
  });

  it('rejects when budget is inactive', async () => {
    const deps = makeDeps({
      checkBudget: vi.fn().mockResolvedValue({ balance: 1_000_000, totalSpent: 0, requestCount: 0, isActive: false }),
    });
    const result = await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('budget_inactive');
  });

  it('rejects when /infer returns preflightDenied', async () => {
    const deps = makeDeps({
      infer: vi.fn().mockResolvedValue({
        success: false,
        preflightDenied: true,
        preflightReason: 'capability_paused',
      }),
    });
    const result = await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('infer_failed');
    expect(result.reason).toContain('capability_paused');
    expect(deps.executeCapability).not.toHaveBeenCalled();
  });

  it('rejects when /execute-capability fails', async () => {
    const deps = makeDeps({
      executeCapability: vi.fn().mockResolvedValue({ success: false, error: 'rpc timeout' }),
    });
    const result = await runAnalystPreset(FAKE_CLIENT, makeConfig(), makeCtx(), deps);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('execute_failed');
  });
});
