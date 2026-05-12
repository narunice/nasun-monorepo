import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { executeCapability, type HostExecuteCapabilityInput } from './host-client.js';
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

function buildInput(): HostExecuteCapabilityInput {
  const decision = { action: 'HOLD' as const, sizeNUSDC: 0, reason: 'init' };
  const intent = openIntent(newIntentChainState());
  return {
    requestId: 1,
    prompt: 'hi',
    model: 'llama-3.3-70b-versatile',
    capabilityId: '0xabc',
    walletAddress:
      '0x' + 'a'.repeat(64),
    envelope: buildAnalysisEnvelope({ decision, outcome: 2 }),
    lineage: intent.lineage,
    wake: buildHeartbeatWake(),
    replay: buildReplay({
      modelVersion: 'llama-3.3-70b-versatile',
      promptText: 'hi',
      strategy: STRATEGY,
    }),
    actionCall: null,
    proposal: buildCognitionProposal({ decision, paymentAmountRaw: 1_000_000n }),
  };
}

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

  it('serialises body with base64-encoded prompt and metadata blocks', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: '{"action":"HOLD","sizeNUSDC":0,"reason":"flat"}',
          resultHash: 'abc',
          executionTimeMs: 12,
          txDigest: 'dig',
          capabilityVersion: '3',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const input = buildInput();
    const r = await executeCapability('https://host.example.com', 'k', input);

    expect(r.success).toBe(true);
    expect(r.result).toContain('HOLD');
    expect(r.txDigest).toBe('dig');
    expect(r.capabilityVersion).toBe('3');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://host.example.com/execute-capability');
    const body = JSON.parse(init.body as string);
    expect(body.encryptedPrompt).toBe(Buffer.from('hi').toString('base64'));
    expect(body.envelope.actionType).toBe('analysis.v1');
    expect(body.proposal.eventClass).toBe(1);
    expect(body.actionCall).toBeNull();
    expect(body.lineage.intentId.length).toBe(16);
  });

  it('surfaces 403 preflight denial without retry', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: false, error: 'denied', reason: 'paused' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const r = await executeCapability('https://host.example.com', 'k', buildInput());
    expect(r.success).toBe(false);
    expect(r.preflightDenied).toBe(true);
    expect(r.preflightReason).toBe('paused');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not retry on 4xx (other than 403)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('bad shape', { status: 400 }),
    );
    const r = await executeCapability('https://host.example.com', 'k', buildInput());
    expect(r.success).toBe(false);
    expect(r.preflightDenied).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('passes triggeredAction through to host body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, result: '{}', txDigest: 'd' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const input = buildInput();
    await executeCapability('https://host.example.com', 'k', {
      ...input,
      triggeredAction: '0x' + 'b'.repeat(64),
      purpose: 'cycle 5',
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.triggeredAction).toBe('0x' + 'b'.repeat(64));
    expect(body.purpose).toBe('cycle 5');
  });
});
