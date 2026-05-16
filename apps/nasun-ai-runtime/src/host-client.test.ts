import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  infer,
  executeCapability,
  type InferRequest,
  type ExecuteCapabilityRequest,
} from './host-client.js';
import {
  buildAnalysisEnvelope,
  buildCognitionProposal,
  buildHeartbeatWake,
  buildReplay,
  newIntentChainState,
  openIntent,
} from './presets/trader-envelope.js';
import { resolveStrategyPreset } from './presets/strategies.js';

const STRATEGY = resolveStrategyPreset('hold_only');

const TEST_ADDR = '0x' + 'a'.repeat(64);

function buildInferInput(): InferRequest {
  return {
    requestId: 1,
    prompt: 'hi',
    model: 'llama-3.3-70b-versatile',
    capabilityId: '0xabc',
    principalAddress: TEST_ADDR,
    promptHash: '0x' + 'a'.repeat(64),
    expectedCapabilityVersion: '1',
  };
}

function buildExecInput(extra: Partial<ExecuteCapabilityRequest> = {}): ExecuteCapabilityRequest {
  const decision = { action: 'HOLD' as const, sizeNUSDC: 0, reason: 'flat' };
  const intent = openIntent(newIntentChainState());
  const proposal = buildCognitionProposal({ decision, paymentAmountRaw: 1_000_000n });
  return {
    requestId: 1,
    promptHash: '0x' + 'a'.repeat(64),
    resultHash: '0x' + 'a'.repeat(64),
    result: 'HOLD',
    executionTimeMs: 12,
    model: 'llama-3.3-70b-versatile',
    capabilityId: '0xabc',
    agentAddress: TEST_ADDR,
    principalAddress: TEST_ADDR,
    expectedCapabilityVersion: '1',
    envelope: buildAnalysisEnvelope({ decision, outcome: 2 }),
    lineage: intent.lineage,
    wake: buildHeartbeatWake(),
    replay: buildReplay({
      modelVersion: 'llama-3.3-70b-versatile',
      promptText: 'hi',
      strategy: STRATEGY,
    }),
    proposal: {
      eventClass: proposal.eventClass,
      actionType: proposal.actionType,
      paymentAmount: proposal.paymentAmount.toString(),
    },
    envelopeHash: '0x' + 'c'.repeat(64),
    actionCallHash: '0x' + '00'.repeat(32),
    sig2: 'fake-sig-base64',
    actionCall: null,
    escrow: null,
    spend: null,
    ...extra,
  };
}

describe('infer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts /infer with base64 prompt + cap snapshot fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: '{"action":"HOLD","sizeNUSDC":0,"reason":"flat"}',
          resultHash: '0x' + 'a'.repeat(64),
          executionTimeMs: 11,
          capabilityVersion: '1',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const r = await infer('https://h', 'k', buildInferInput());
    expect(r.success).toBe(true);
    expect(r.capabilityVersion).toBe('1');
    expect(r.resultHash).toMatch(/^0x[a]+$/);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://h/infer');
    const body = JSON.parse(init.body as string);
    expect(body.encryptedPrompt).toBe(Buffer.from('hi').toString('base64'));
    expect(body.principalAddress).toBe(TEST_ADDR);
    expect(body.promptHash).toBe('0x' + 'a'.repeat(64));
    expect(body.expectedCapabilityVersion).toBe('1');
  });

  it('surfaces 403 preflight denial without retry', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'preflight', reason: 'paused' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await infer('https://h', 'k', buildInferInput());
    expect(r.success).toBe(false);
    expect(r.preflightDenied).toBe(true);
    expect(r.preflightReason).toBe('paused');
  });
});

describe('executeCapability', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('serialises HOLD body with sig2 + null actionCall/escrow/spend', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, txDigest: 'd', capabilityVersion: '3' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const r = await executeCapability('https://h', 'k', buildExecInput());
    expect(r.success).toBe(true);
    expect(r.txDigest).toBe('d');
    expect(r.capabilityVersion).toBe('3');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.sig2).toBe('fake-sig-base64');
    expect(body.resultHash).toMatch(/^0x[a]+$/);
    expect(body.envelopeHash).toBe('0x' + 'c'.repeat(64));
    expect(body.actionCallHash).toBe('0x' + '00'.repeat(32));
    expect(body.actionCall).toBeNull();
    expect(body.escrow).toBeNull();
    expect(body.spend).toBeNull();
    expect(body.agentAddress).toBe(TEST_ADDR);
    expect(body.principalAddress).toBe(TEST_ADDR);
    expect(body.expectedCapabilityVersion).toBe('1');
  });

  it('forwards execution payload (actionCall + escrow + spend) for PR1.5 swap branch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, txDigest: 'd' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const actionCall = {
      targetPackage: '0xabc',
      module: 'pool',
      fn: 'swap_exact_quote_for_base',
      typeArguments: ['T1', 'T2'],
      args: [{ kind: 'object' as const, id: '0xpool' }],
    };
    const escrow = {
      objectId: '0xescrow',
      initialSharedVersion: '100',
      capabilityId: '0xcap',
      capabilityInitialSharedVersion: '90',
    };
    const spend = { coinAssetType: 'T1', amount: '1000' };
    await executeCapability('https://h', 'k', buildExecInput({ actionCall, escrow, spend }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.actionCall).toEqual(actionCall);
    expect(body.escrow).toEqual(escrow);
    expect(body.spend).toEqual(spend);
  });

  it('forwards null actionCall/escrow/spend for HOLD branch', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, txDigest: 'd' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await executeCapability('https://h', 'k', buildExecInput());
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.actionCall).toBeNull();
    expect(body.escrow).toBeNull();
    expect(body.spend).toBeNull();
  });

  it('surfaces 403 preflight denial without retry', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'denied', reason: 'paused' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await executeCapability('https://h', 'k', buildExecInput());
    expect(r.success).toBe(false);
    expect(r.preflightDenied).toBe(true);
    expect(r.preflightReason).toBe('paused');
  });

  it('does not retry on non-403 4xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response('bad shape', { status: 400 }));
    const r = await executeCapability('https://h', 'k', buildExecInput());
    expect(r.success).toBe(false);
    expect(r.preflightDenied).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
