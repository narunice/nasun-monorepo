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

function buildInferInput(): InferRequest {
  return {
    requestId: 1,
    prompt: 'hi',
    model: 'llama-3.3-70b-versatile',
    capabilityId: '0xabc',
    walletAddress: '0x' + 'a'.repeat(64),
  };
}

function buildExecInput(extra: Partial<ExecuteCapabilityRequest> = {}): ExecuteCapabilityRequest {
  const decision = { action: 'HOLD' as const, sizeNUSDC: 0, reason: 'flat' };
  const intent = openIntent(newIntentChainState());
  const proposal = buildCognitionProposal({ decision, paymentAmountRaw: 1_000_000n });
  return {
    requestId: 1,
    resultHash: 'a'.repeat(64),
    executionTimeMs: 12,
    spendToken: 'token',
    nonce: 'b'.repeat(32),
    expiresAt: Date.now() + 30_000,
    model: 'llama-3.3-70b-versatile',
    capabilityId: '0xabc',
    walletAddress: '0x' + 'a'.repeat(64),
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
    actionCall: null,
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

  it('posts /infer with base64 prompt and returns token fields', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: '{"action":"HOLD","sizeNUSDC":0,"reason":"flat"}',
          resultHash: 'a'.repeat(64),
          executionTimeMs: 11,
          spendToken: 'tok',
          nonce: 'b'.repeat(32),
          expiresAt: 9_999_999_999,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const r = await infer('https://h', 'k', buildInferInput());
    expect(r.success).toBe(true);
    expect(r.spendToken).toBe('tok');
    expect(r.resultHash).toMatch(/^a+$/);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://h/infer');
    const body = JSON.parse(init.body as string);
    expect(body.encryptedPrompt).toBe(Buffer.from('hi').toString('base64'));
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

  it('serialises cognition body with token fields and null actionCall', async () => {
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
    expect(body.spendToken).toBe('token');
    expect(body.resultHash).toMatch(/^a+$/);
    expect(body.actionCall).toBeNull();
    expect(body.escrow).toBeUndefined();
    expect(body.spend).toBeUndefined();
  });

  it('forwards execution payload (actionCall + escrow + spend)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, txDigest: 'd' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await executeCapability('https://h', 'k', buildExecInput({
      actionCall: {
        targetPackage: '0xabc',
        module: 'pool',
        fn: 'swap_exact_quote_for_base',
        typeArguments: ['T1', 'T2'],
        args: [{ kind: 'object', id: '0xpool' }],
      },
      escrow: {
        objectId: '0xescrow',
        initialSharedVersion: '100',
        capabilityId: '0xabc',
      },
      spend: { coinAssetType: 'T1', amount: '1000' },
    }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.actionCall.fn).toBe('swap_exact_quote_for_base');
    expect(body.escrow.objectId).toBe('0xescrow');
    expect(body.spend.amount).toBe('1000');
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
