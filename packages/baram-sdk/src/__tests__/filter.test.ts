import { describe, it, expect } from 'vitest';
import { applyFilter } from '../services/filter';
import type { AERRecord } from '../types/aer';

function makeRecord(overrides: Partial<AERRecord> = {}): AERRecord {
  return {
    objectId: '0xdefault',
    requestId: 1,
    initiator: '0xuser1',
    authorizer: '0xuser1',
    delegationPath: [],
    executor: '0xexec1',
    executorPrincipal: null,
    paymentAmount: 5_000_000,
    paymentToken: 0,
    executorReceived: 4_500_000,
    feeDetail: null,
    budgetId: null,
    budgetRemaining: null,
    modelName: 'gpt-4o',
    modelMetadata: null,
    inputHash: 'abcd',
    outputHash: '1234',
    executionTimeMs: 1500,
    purpose: null,
    policyVersion: null,
    constraints: null,
    executorTier: 2,
    executorTierName: 'Silver',
    executorReputation: 850,
    executorStakeAmount: 1_000_000_000,
    teeVerified: true,
    teeAttestationHash: null,
    requestedAt: 1700000000000,
    settledAt: 1700000001500,
    status: 0,
    statusName: 'Settled',
    triggeredBy: null,
    triggeredAction: null,
    ...overrides,
  };
}

const records: AERRecord[] = [
  makeRecord({ objectId: '0x1', initiator: '0xalice', executor: '0xexec1', modelName: 'gpt-4o', paymentAmount: 3_000_000, executorTier: 1, teeVerified: false, settledAt: 1000, budgetId: null, triggeredBy: null }),
  makeRecord({ objectId: '0x2', initiator: '0xbob', executor: '0xexec2', modelName: 'claude-3', paymentAmount: 8_000_000, executorTier: 3, teeVerified: true, settledAt: 2000, budgetId: '0xbudget1', triggeredBy: '0xparent' }),
  makeRecord({ objectId: '0x3', initiator: '0xalice', executor: '0xexec1', modelName: 'llama-3', paymentAmount: 1_000_000, executorTier: 0, teeVerified: false, settledAt: 3000, budgetId: null, triggeredBy: null, status: 1, statusName: 'Disputed' }),
  makeRecord({ objectId: '0x4', initiator: '0xcharlie', executor: '0xexec3', modelName: 'gpt-4o', paymentAmount: 5_000_000, executorTier: 2, teeVerified: true, settledAt: 4000, budgetId: '0xbudget2', triggeredBy: '0xparent2', paymentToken: 1 }),
];

describe('applyFilter', () => {
  it('returns all records when no filter criteria are set', () => {
    const result = applyFilter(records, {});
    expect(result).toHaveLength(4);
  });

  // Address filters
  it('filters by initiator', () => {
    const result = applyFilter(records, { initiator: '0xalice' });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x1', '0x3']);
  });

  it('filters by executor', () => {
    const result = applyFilter(records, { executor: '0xexec1' });
    expect(result).toHaveLength(2);
  });

  it('filters by authorizer', () => {
    const result = applyFilter(records, { authorizer: '0xbob' });
    // default authorizer = initiator in makeRecord overrides, only 0x2 has initiator=0xbob
    // but authorizer defaults to '0xuser1' unless overridden
    expect(result).toHaveLength(0);
  });

  // Budget filters
  it('filters by budgetId', () => {
    const result = applyFilter(records, { budgetId: '0xbudget1' });
    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('0x2');
  });

  it('filters hasBudget=true (budget-funded only)', () => {
    const result = applyFilter(records, { hasBudget: true });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x2', '0x4']);
  });

  it('filters hasBudget=false (direct payment only)', () => {
    const result = applyFilter(records, { hasBudget: false });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x1', '0x3']);
  });

  // Model filters
  it('filters by modelName', () => {
    const result = applyFilter(records, { modelName: 'gpt-4o' });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x1', '0x4']);
  });

  it('filters by modelNames (OR match)', () => {
    const result = applyFilter(records, { modelNames: ['gpt-4o', 'claude-3'] });
    expect(result).toHaveLength(3);
  });

  // Tier / trust filters
  it('filters by minTier', () => {
    const result = applyFilter(records, { minTier: 2 });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x2', '0x4']);
  });

  it('filters by teeVerified', () => {
    const result = applyFilter(records, { teeVerified: true });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x2', '0x4']);
  });

  // Status filter
  it('filters by status', () => {
    const result = applyFilter(records, { status: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('0x3');
  });

  // Time range
  it('filters by settledAfter', () => {
    const result = applyFilter(records, { settledAfter: 2500 });
    expect(result).toHaveLength(2);
  });

  it('filters by settledBefore', () => {
    const result = applyFilter(records, { settledBefore: 2000 });
    expect(result).toHaveLength(2);
  });

  it('filters by time range (settledAfter + settledBefore)', () => {
    const result = applyFilter(records, { settledAfter: 1500, settledBefore: 3500 });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x2', '0x3']);
  });

  // Payment range
  it('filters by minPayment', () => {
    const result = applyFilter(records, { minPayment: 5_000_000 });
    expect(result).toHaveLength(2);
  });

  it('filters by maxPayment', () => {
    const result = applyFilter(records, { maxPayment: 3_000_000 });
    expect(result).toHaveLength(2);
  });

  it('filters by paymentToken', () => {
    const result = applyFilter(records, { paymentToken: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('0x4');
  });

  // Chain filters
  it('filters hasTriggeredBy=true', () => {
    const result = applyFilter(records, { hasTriggeredBy: true });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x2', '0x4']);
  });

  it('filters hasTriggeredBy=false', () => {
    const result = applyFilter(records, { hasTriggeredBy: false });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.objectId)).toEqual(['0x1', '0x3']);
  });

  // Combined filters (AND logic)
  it('combines multiple filters with AND', () => {
    const result = applyFilter(records, {
      initiator: '0xalice',
      teeVerified: false,
      status: 0,
    });
    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('0x1');
  });

  // Limit
  it('respects limit', () => {
    const result = applyFilter(records, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('respects limit with filters', () => {
    const result = applyFilter(records, { modelName: 'gpt-4o', limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('0x1');
  });

  // Edge cases
  it('returns empty array for no matches', () => {
    const result = applyFilter(records, { initiator: '0xnonexistent' });
    expect(result).toHaveLength(0);
  });

  it('handles empty records array', () => {
    const result = applyFilter([], { initiator: '0xalice' });
    expect(result).toHaveLength(0);
  });
});
