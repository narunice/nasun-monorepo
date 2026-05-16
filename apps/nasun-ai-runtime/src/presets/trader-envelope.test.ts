import { describe, it, expect } from 'vitest';
import { aer as aerSdk } from '@nasun/baram-sdk';

import {
  buildAnalysisEnvelope,
  buildCognitionProposal,
  buildHeartbeatWake,
  buildReplay,
  encodeAnalysisV1,
  newIntentChainState,
  nextRetry,
  openIntent,
  recentTradesSnapshot,
  ACTION_TYPE_ANALYSIS,
} from './trader-envelope.js';
import { resolveStrategyPreset } from './strategies.js';
import type { TradeDecision, TradeRecord } from './trader.js';

const STRATEGY = resolveStrategyPreset('conservative_dca');

describe('encodeAnalysisV1', () => {
  it('round-trips decision tag in byte 0 (BUY=1)', () => {
    const bytes = encodeAnalysisV1({
      decision: 'BUY',
      sizeQuoteRaw: 1_500_000n,
      reason: 'small dip BUY',
    });
    expect(bytes[0]).toBe(1);
  });

  it('encodes size as little-endian u64 (bytes 1..9)', () => {
    const bytes = encodeAnalysisV1({
      decision: 'SELL',
      sizeQuoteRaw: 0x0102030405060708n,
      reason: 'x',
    });
    expect(bytes[0]).toBe(2); // SELL
    expect(Array.from(bytes.slice(1, 9))).toEqual([
      0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01,
    ]);
  });

  it('truncates reason to 280 bytes', () => {
    const longReason = 'x'.repeat(1000);
    const bytes = encodeAnalysisV1({
      decision: 'HOLD',
      sizeQuoteRaw: 0n,
      reason: longReason,
    });
    // Last bytes are the reason text; verify total <= 1 + 8 + uleb + 280.
    expect(bytes.length).toBeLessThanOrEqual(1 + 8 + 2 + 280);
  });
});

describe('buildAnalysisEnvelope', () => {
  it('emits cognition class with analysis.v1 actionType', () => {
    const decision: TradeDecision = {
      action: 'HOLD',
      sizeNUSDC: 0,
      reason: 'spread too wide',
    };
    const env = buildAnalysisEnvelope({ decision, outcome: 2 });
    expect(env.eventClass).toBe(1);
    expect(env.actionType).toBe(ACTION_TYPE_ANALYSIS);
    expect(env.payloadCodec).toBe('bcs');
    expect(env.actionOutcome).toBe(2);
    expect(env.actionSummary.startsWith('HOLD')).toBe(true);
  });

  it('payloadHash matches SDK helper for the same bytes', () => {
    const decision: TradeDecision = {
      action: 'BUY',
      sizeNUSDC: 1.25,
      reason: 'starter buy',
    };
    const env = buildAnalysisEnvelope({ decision, outcome: 1 });
    const expected = Array.from(
      aerSdk.computePayloadHash(
        ACTION_TYPE_ANALYSIS,
        Uint8Array.from(env.payloadBytes),
      ),
    );
    expect(env.payloadHash).toEqual(expected);
  });
});

describe('intent chain', () => {
  it('open + commit promotes child to parent for next call', () => {
    const state = newIntentChainState();
    const i1 = openIntent(state);
    expect(i1.lineage.parentIntentId).toBeNull();
    expect(i1.lineage.executionId).toBe(1);

    i1.commit();
    const i2 = openIntent(state);
    expect(i2.lineage.parentIntentId).toEqual(i1.lineage.intentId);
    expect(i2.lineage.executionId).toBe(1);
  });

  it('uncommitted intent does NOT become parent of the next', () => {
    const state = newIntentChainState();
    const i1 = openIntent(state);
    // host call failed -- do not commit
    const i2 = openIntent(state);
    expect(i2.lineage.parentIntentId).toBeNull();
    void i1;
  });

  it('nextRetry bumps executionId without rotating intent', () => {
    const state = newIntentChainState();
    const i1 = openIntent(state);
    nextRetry(state);
    const i2 = openIntent(state);
    expect(i2.lineage.executionId).toBe(2);
    // Different intent id (still a fresh UUIDv7) -- nextRetry only bumps the
    // counter, openIntent always mints a new id.
    expect(i2.lineage.intentId).not.toEqual(i1.lineage.intentId);
  });

  it('intent ids are valid UUIDv7', () => {
    const state = newIntentChainState();
    const { lineage } = openIntent(state);
    expect(aerSdk.isUuidV7(Uint8Array.from(lineage.intentId))).toBe(true);
  });
});

describe('buildHeartbeatWake', () => {
  it('emits triggeredByType=1 and null ref', () => {
    const wake = buildHeartbeatWake();
    expect(wake.triggeredByType).toBe(1);
    expect(wake.triggeredByRef).toBeNull();
  });
});

describe('buildReplay', () => {
  it('hashes the prompt text + emits canonical extras (no marketSnapshot)', () => {
    const replay = buildReplay({
      modelVersion: 'llama-3.3-70b-versatile',
      promptText: 'hello world',
      strategy: STRATEGY,
    });
    expect(replay.modelVersion).toBe('llama-3.3-70b-versatile');
    expect(replay.promptTemplateHash.length).toBe(32);
    expect(replay.marketSnapshotHash).toBeNull();
    const keys = replay.replayExtras.map(([k]) => k);
    expect(keys).toEqual(['cycle_at_ms', 'strategy_id']);
    expect(aerSdk.isCanonicalKeySequence(keys)).toBe(true);
  });

  it('includes market_snapshot when supplied + canonical key order', () => {
    const replay = buildReplay({
      modelVersion: 'm',
      promptText: 'p',
      strategy: STRATEGY,
      marketSnapshot: { z: 1, a: 2 },
    });
    const keys = replay.replayExtras.map(([k]) => k);
    expect(keys).toEqual(['cycle_at_ms', 'market_snapshot', 'strategy_id']);
    expect(aerSdk.isCanonicalKeySequence(keys)).toBe(true);
    expect(replay.marketSnapshotHash?.length).toBe(32);
  });

  it('rejects collisions with reserved replay_extras keys', () => {
    expect(() =>
      buildReplay({
        modelVersion: 'm',
        promptText: 'p',
        strategy: STRATEGY,
        extras: [['strategy_id', new Uint8Array([1])]],
      }),
    ).toThrow(/reserved/);
  });

  it('caller extras land in canonical order with reserved keys', () => {
    const replay = buildReplay({
      modelVersion: 'm',
      promptText: 'p',
      strategy: STRATEGY,
      extras: [
        ['z_extra', new Uint8Array([1])],
        ['a_extra', new Uint8Array([2])],
      ],
    });
    const keys = replay.replayExtras.map(([k]) => k);
    // Canonical UTF-8 byte order across all keys.
    expect(keys).toEqual([
      'a_extra',
      'cycle_at_ms',
      'strategy_id',
      'z_extra',
    ]);
  });
});

describe('buildCognitionProposal', () => {
  it('emits eventClass=1 + analysis.v1 + decimal-string payment', () => {
    const decision: TradeDecision = { action: 'HOLD', sizeNUSDC: 0, reason: 'x' };
    const p = buildCognitionProposal({
      decision,
      paymentAmountRaw: 18_446_744_073_709_551_615n, // 2^64-1
    });
    expect(p.eventClass).toBe(1);
    expect(p.actionType).toBe(ACTION_TYPE_ANALYSIS);
    expect(p.paymentAmount).toBe('18446744073709551615');
  });
});

describe('recentTradesSnapshot', () => {
  it('truncates to last 3 + serialises bigint as string', () => {
    const records: TradeRecord[] = [];
    for (let i = 0; i < 5; i++) {
      records.push({
        ts: 1700000000000 + i,
        action: i % 2 === 0 ? 'BUY' : 'SELL',
        sizeQuoteRaw: BigInt(i + 1) * 1_000_000n,
        digest: `dig${i}`,
      });
    }
    const snap = recentTradesSnapshot(records);
    expect(snap.length).toBe(3);
    expect(snap[0].digest).toBe('dig2');
    expect(snap[2].sizeQuoteRaw).toBe('5000000');
  });
});
