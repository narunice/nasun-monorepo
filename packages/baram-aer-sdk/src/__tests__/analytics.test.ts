import { describe, it, expect } from 'vitest';
import { summarize, groupBy, spendingTimeline, trustProfile } from '../services/analytics';
import { computeBudgetUtilization } from '../services/budget-analytics';
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
    executionTimeMs: 1000,
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
    settledAt: 1700000001000,
    status: 0,
    statusName: 'Settled',
    triggeredBy: null,
    triggeredAction: null,
    ...overrides,
  };
}

const records: AERRecord[] = [
  makeRecord({ objectId: '0x1', executor: '0xexec1', modelName: 'gpt-4o', paymentAmount: 3_000_000, executorTier: 1, executorTierName: 'Bronze', teeVerified: false, settledAt: 1700000000000, executionTimeMs: 500, budgetId: null }),
  makeRecord({ objectId: '0x2', executor: '0xexec2', modelName: 'claude-3', paymentAmount: 8_000_000, executorTier: 3, executorTierName: 'Gold', teeVerified: true, settledAt: 1700000060000, executionTimeMs: 2000, budgetId: '0xbudget1', budgetRemaining: 50_000_000 }),
  makeRecord({ objectId: '0x3', executor: '0xexec1', modelName: 'llama-3', paymentAmount: 1_000_000, executorTier: 0, executorTierName: 'Open', teeVerified: false, settledAt: 1700000120000, executionTimeMs: 300, status: 1, statusName: 'Disputed', budgetId: null }),
  makeRecord({ objectId: '0x4', executor: '0xexec3', modelName: 'gpt-4o', paymentAmount: 5_000_000, executorTier: 2, executorTierName: 'Silver', teeVerified: true, settledAt: 1700000180000, executionTimeMs: 1500, paymentToken: 1, budgetId: '0xbudget1', budgetRemaining: 45_000_000 }),
];

describe('summarize', () => {
  it('returns empty summary for empty array', () => {
    const s = summarize([]);
    expect(s.totalRecords).toBe(0);
    expect(s.totalPaymentNusdc).toBe(0);
    expect(s.avgPaymentNusdc).toBe(0);
    expect(s.earliestSettledAt).toBeNull();
    expect(s.latestSettledAt).toBeNull();
  });

  it('computes correct totals', () => {
    const s = summarize(records);
    expect(s.totalRecords).toBe(4);
    // NUSDC payments: 3M + 8M + 1M = 12M (0x4 uses NASUN token=1)
    expect(s.totalPaymentNusdc).toBe(12_000_000);
    expect(s.totalPaymentNasun).toBe(5_000_000);
  });

  it('computes correct averages', () => {
    const s = summarize(records);
    expect(s.avgPaymentNusdc).toBe(12_000_000 / 4);
    expect(s.avgExecutionTimeMs).toBe((500 + 2000 + 300 + 1500) / 4);
  });

  it('computes correct median execution time', () => {
    const s = summarize(records);
    // Sorted times: [300, 500, 1500, 2000], median of even = (500+1500)/2 = 1000
    expect(s.medianExecutionTimeMs).toBe(1000);
  });

  it('computes correct distributions', () => {
    const s = summarize(records);
    expect(s.modelDistribution['gpt-4o']).toBe(2);
    expect(s.modelDistribution['claude-3']).toBe(1);
    expect(s.modelDistribution['llama-3']).toBe(1);
    expect(s.tierDistribution['Open']).toBe(1);
    expect(s.tierDistribution['Bronze']).toBe(1);
    expect(s.tierDistribution['Silver']).toBe(1);
    expect(s.tierDistribution['Gold']).toBe(1);
    expect(s.statusDistribution['Settled']).toBe(3);
    expect(s.statusDistribution['Disputed']).toBe(1);
  });

  it('computes budget/direct and TEE counts', () => {
    const s = summarize(records);
    expect(s.budgetFundedCount).toBe(2);
    expect(s.directFundedCount).toBe(2);
    expect(s.budgetFundedPercentage).toBe(50);
    expect(s.teeVerifiedCount).toBe(2);
    expect(s.teeVerifiedPercentage).toBe(50);
  });

  it('computes correct time range', () => {
    const s = summarize(records);
    expect(s.earliestSettledAt).toBe(1700000000000);
    expect(s.latestSettledAt).toBe(1700000180000);
  });

  it('computes executor distribution', () => {
    const s = summarize(records);
    expect(s.executorDistribution['0xexec1']).toBe(2);
    expect(s.executorDistribution['0xexec2']).toBe(1);
    expect(s.executorDistribution['0xexec3']).toBe(1);
  });
});

describe('groupBy', () => {
  it('groups by executor', () => {
    const groups = groupBy(records, 'executor');
    expect(groups.size).toBe(3);
    expect(groups.get('0xexec1')?.length).toBe(2);
    expect(groups.get('0xexec2')?.length).toBe(1);
  });

  it('groups by modelName', () => {
    const groups = groupBy(records, 'modelName');
    expect(groups.size).toBe(3);
    expect(groups.get('gpt-4o')?.length).toBe(2);
  });

  it('groups by status', () => {
    const groups = groupBy(records, 'status');
    expect(groups.get('Settled')?.length).toBe(3);
    expect(groups.get('Disputed')?.length).toBe(1);
  });

  it('groups by executorTier', () => {
    const groups = groupBy(records, 'executorTier');
    expect(groups.size).toBe(4); // Open, Bronze, Silver, Gold
  });

  it('groups by paymentToken', () => {
    const groups = groupBy(records, 'paymentToken');
    expect(groups.get('NUSDC')?.length).toBe(3);
    expect(groups.get('NASUN')?.length).toBe(1);
  });

  it('groups by budgetId (null → "direct")', () => {
    const groups = groupBy(records, 'budgetId');
    expect(groups.get('direct')?.length).toBe(2);
    expect(groups.get('0xbudget1')?.length).toBe(2);
  });

  it('returns empty map for empty input', () => {
    const groups = groupBy([], 'executor');
    expect(groups.size).toBe(0);
  });
});

describe('spendingTimeline', () => {
  it('returns empty array for empty input', () => {
    const result = spendingTimeline([], 'hour');
    expect(result).toEqual([]);
  });

  it('bucketizes by hour', () => {
    const result = spendingTimeline(records, 'hour');
    // All records within same hour → 1 bucket
    expect(result.length).toBe(1);
    expect(result[0].recordCount).toBe(4);
    expect(result[0].totalSpent).toBe(17_000_000);
  });

  it('bucketizes by day with spread records', () => {
    const spreadRecords = [
      makeRecord({ settledAt: 1700000000000, paymentAmount: 1_000_000 }), // day 1
      makeRecord({ settledAt: 1700100000000, paymentAmount: 2_000_000 }), // ~1.2 days later
    ];
    const result = spendingTimeline(spreadRecords, 'day');
    // Timeline includes all day-aligned buckets between first and last (including empty gaps)
    expect(result.length).toBeGreaterThanOrEqual(2);
    const nonEmpty = result.filter((e) => e.recordCount > 0);
    expect(nonEmpty.length).toBe(2);
    expect(nonEmpty[0].recordCount).toBe(1);
    expect(nonEmpty[1].recordCount).toBe(1);
  });

  it('skips records with settledAt=0', () => {
    const withZero = [
      makeRecord({ settledAt: 0, paymentAmount: 999 }),
      makeRecord({ settledAt: 1700000000000, paymentAmount: 1_000_000 }),
    ];
    const result = spendingTimeline(withZero, 'hour');
    expect(result.length).toBe(1);
    expect(result[0].recordCount).toBe(1);
  });

  it('computes correct avgPayment per bucket', () => {
    const result = spendingTimeline(records, 'hour');
    expect(result[0].avgPayment).toBe(17_000_000 / 4);
  });
});

describe('trustProfile', () => {
  it('returns empty profile for empty input', () => {
    const p = trustProfile([]);
    expect(p.totalRecords).toBe(0);
    expect(p.executorDiversity).toBe(0);
    expect(p.tierDistribution).toEqual([]);
    expect(p.topExecutors).toEqual([]);
  });

  it('computes correct TEE percentage', () => {
    const p = trustProfile(records);
    expect(p.teeVerifiedPercentage).toBe(50);
  });

  it('computes correct avg tier and reputation', () => {
    const p = trustProfile(records);
    expect(p.avgExecutorTier).toBe((1 + 3 + 0 + 2) / 4);
    expect(p.avgExecutorReputation).toBe(850); // all records have same reputation
  });

  it('computes executor diversity', () => {
    const p = trustProfile(records);
    expect(p.executorDiversity).toBe(3); // exec1, exec2, exec3
  });

  it('computes tier distribution', () => {
    const p = trustProfile(records);
    expect(p.tierDistribution.length).toBe(4);
    for (const entry of p.tierDistribution) {
      expect(entry.count).toBe(1);
      expect(entry.percentage).toBe(25);
    }
  });

  it('computes top executors sorted by count', () => {
    const p = trustProfile(records);
    expect(p.topExecutors[0].address).toBe('0xexec1');
    expect(p.topExecutors[0].count).toBe(2);
    expect(p.topExecutors.length).toBe(3);
  });
});

describe('computeBudgetUtilization', () => {
  const budgetRecords = records.filter((r) => r.budgetId === '0xbudget1');

  it('returns empty utilization for no records', () => {
    const u = computeBudgetUtilization('0xnone', []);
    expect(u.totalRecords).toBe(0);
    expect(u.totalSpent).toBe(0);
    expect(u.estimatedBurnRate).toBeNull();
    expect(u.estimatedRunway).toBeNull();
  });

  it('computes total spent', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    expect(u.totalRecords).toBe(2);
    expect(u.totalSpent).toBe(8_000_000 + 5_000_000);
  });

  it('tracks latest budget remaining', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    expect(u.latestBudgetRemaining).toBe(45_000_000);
  });

  it('estimates burn rate from timeline', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    // remaining went from 50M to 45M over 120s (2min)
    // burn rate = 5M / (120/3600) hours = 5M / 0.0333h = 150M/h
    expect(u.estimatedBurnRate).toBeGreaterThan(0);
  });

  it('estimates runway', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    // runway = 45M / burnRate
    expect(u.estimatedRunway).toBeGreaterThan(0);
  });

  it('computes model usage breakdown', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    expect(u.modelUsage.length).toBe(2);
    // Sorted by totalSpent desc
    expect(u.modelUsage[0].model).toBe('claude-3');
    expect(u.modelUsage[0].totalSpent).toBe(8_000_000);
  });

  it('computes executor usage breakdown', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    expect(u.executorUsage.length).toBe(2);
  });

  it('tracks balance timeline', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    expect(u.balanceTimeline.length).toBe(2);
    expect(u.balanceTimeline[0].remaining).toBe(50_000_000);
    expect(u.balanceTimeline[1].remaining).toBe(45_000_000);
  });

  it('collects unique agent addresses', () => {
    const u = computeBudgetUtilization('0xbudget1', budgetRecords);
    expect(u.agents).toContain('0xuser1');
  });
});
