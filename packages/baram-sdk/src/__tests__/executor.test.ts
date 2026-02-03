import { describe, it, expect } from 'vitest';
import { selectExecutorWeightedRandom, calculateTierClient } from '../services/executor';
import type { ExecutorInfo } from '../types';

function makeExecutor(overrides: Partial<ExecutorInfo> = {}): ExecutorInfo {
  return {
    id: '0xexecutor1',
    operator: '0xexecutor1',
    name: 'Test Executor',
    endpointUrl: 'http://localhost:3000',
    teeType: 0,
    teeTypeName: 'None',
    supportedModels: [],
    reputation: 500,
    completedJobs: 10,
    failedJobs: 0,
    registeredAt: Date.now(),
    lastActiveAt: Date.now(),
    isActive: true,
    tier: 1,
    tierName: 'Bronze',
    isDormant: false,
    ...overrides,
  };
}

describe('selectExecutorWeightedRandom', () => {
  it('returns null for empty executor list', () => {
    const result = selectExecutorWeightedRandom([]);
    expect(result).toBeNull();
  });

  it('returns the only executor if list has one', () => {
    const executor = makeExecutor();
    const result = selectExecutorWeightedRandom([executor]);
    expect(result).toBe(executor);
  });

  it('filters out inactive executors', () => {
    const inactive = makeExecutor({ isActive: false });
    const result = selectExecutorWeightedRandom([inactive]);
    expect(result).toBeNull();
  });

  it('filters out executors below minimum tier', () => {
    const openTier = makeExecutor({ tier: 0, tierName: 'Open' });
    const result = selectExecutorWeightedRandom([openTier], new Set(), 1);
    expect(result).toBeNull();
  });

  it('filters out excluded executors', () => {
    const executor = makeExecutor({ id: '0xabc' });
    const result = selectExecutorWeightedRandom([executor], new Set(['0xabc']));
    expect(result).toBeNull();
  });

  it('filters by model support', () => {
    const executor = makeExecutor({ supportedModels: ['llama-3.2-3b-local'] });
    const resultMatch = selectExecutorWeightedRandom([executor], new Set(), undefined, 'llama-3.2-3b-local');
    expect(resultMatch).toBe(executor);

    const resultNoMatch = selectExecutorWeightedRandom([executor], new Set(), undefined, 'gpt-4o');
    expect(resultNoMatch).toBeNull();
  });

  it('accepts executor with empty supportedModels for any model', () => {
    const executor = makeExecutor({ supportedModels: [] });
    const result = selectExecutorWeightedRandom([executor], new Set(), undefined, 'any-model');
    expect(result).toBe(executor);
  });

  it('prefers higher reputation executor statistically', () => {
    const lowRep = makeExecutor({ id: '0xlow', operator: '0xlow', reputation: 100 });
    const highRep = makeExecutor({ id: '0xhigh', operator: '0xhigh', reputation: 900 });

    const counts: Record<string, number> = { '0xlow': 0, '0xhigh': 0 };
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const result = selectExecutorWeightedRandom([lowRep, highRep]);
      if (result) counts[result.id]++;
    }

    // High rep should be selected more often
    expect(counts['0xhigh']).toBeGreaterThan(counts['0xlow']);
  });
});

describe('calculateTierClient', () => {
  it('returns Open for zero stake and reputation', () => {
    expect(calculateTierClient(0, 0)).toBe(0);
  });

  it('returns Bronze for min stake and min reputation', () => {
    expect(calculateTierClient(1_000_000_000_000, 300)).toBe(1);
  });

  it('returns min of stake tier and rep tier', () => {
    // Gold stake, Bronze rep → Bronze
    expect(calculateTierClient(10_000_000_000_000, 300)).toBe(1);
    // Bronze stake, Gold rep → Bronze
    expect(calculateTierClient(1_000_000_000_000, 700)).toBe(1);
  });

  it('returns Gold for max stake and reputation', () => {
    expect(calculateTierClient(10_000_000_000_000, 700)).toBe(3);
  });
});
