import { describe, it, expect, vi } from 'vitest';
import { AERClient } from '../client';
import { createDevnetConfig } from '../config';
import type { AERRecord } from '../types/aer';

// Mock all service modules
vi.mock('../services/fetch', () => ({
  fetchAERObject: vi.fn(),
  fetchAERByRequestId: vi.fn(),
  fetchRecentAEREvents: vi.fn(),
  fetchAERByAddress: vi.fn(),
  fetchAERByBudgetId: vi.fn(),
}));

vi.mock('../services/chain', () => ({
  traceChainBackward: vi.fn(),
  traceChainForward: vi.fn(),
}));

import {
  fetchAERObject,
  fetchAERByRequestId,
  fetchRecentAEREvents,
  fetchAERByAddress,
  fetchAERByBudgetId,
} from '../services/fetch';
import { traceChainBackward, traceChainForward } from '../services/chain';

const mockFetchAERObject = vi.mocked(fetchAERObject);
const mockFetchAERByRequestId = vi.mocked(fetchAERByRequestId);
const mockFetchRecentAEREvents = vi.mocked(fetchRecentAEREvents);
const mockFetchAERByAddress = vi.mocked(fetchAERByAddress);
const mockFetchAERByBudgetId = vi.mocked(fetchAERByBudgetId);
const mockTraceChainBackward = vi.mocked(traceChainBackward);
const mockTraceChainForward = vi.mocked(traceChainForward);

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

const config = createDevnetConfig();

describe('AERClient', () => {
  it('constructs without error', () => {
    const client = new AERClient({ config });
    expect(client).toBeDefined();
  });

  it('getByRequestId delegates to fetchAERByRequestId', async () => {
    const record = makeRecord({ requestId: 42 });
    mockFetchAERByRequestId.mockResolvedValueOnce(record);

    const client = new AERClient({ config });
    const result = await client.getByRequestId(42);
    expect(result).toEqual(record);
    expect(mockFetchAERByRequestId).toHaveBeenCalledWith(expect.anything(), config, 42);
  });

  it('getByObjectId delegates to fetchAERObject', async () => {
    const record = makeRecord({ objectId: '0xobj' });
    mockFetchAERObject.mockResolvedValueOnce(record);

    const client = new AERClient({ config });
    const result = await client.getByObjectId('0xobj');
    expect(result).toEqual(record);
  });

  it('getRecent delegates to fetchRecentAEREvents', async () => {
    const paginatedResult = {
      data: [makeRecord()],
      hasNextPage: false,
      nextCursor: null,
    };
    mockFetchRecentAEREvents.mockResolvedValueOnce(paginatedResult);

    const client = new AERClient({ config });
    const result = await client.getRecent({ limit: 10 });
    expect(result.data).toHaveLength(1);
    expect(result.hasNextPage).toBe(false);
  });

  it('query fetches and filters in-memory', async () => {
    const records = [
      makeRecord({ objectId: '0x1', modelName: 'gpt-4o' }),
      makeRecord({ objectId: '0x2', modelName: 'claude-3' }),
    ];
    mockFetchRecentAEREvents.mockResolvedValueOnce({
      data: records,
      hasNextPage: false,
      nextCursor: null,
    });

    const client = new AERClient({ config });
    const result = await client.query({ modelName: 'gpt-4o' });
    expect(result).toHaveLength(1);
    expect(result[0].objectId).toBe('0x1');
  });

  it('getByInitiator delegates to fetchAERByAddress with role=initiator', async () => {
    mockFetchAERByAddress.mockResolvedValueOnce([makeRecord()]);

    const client = new AERClient({ config });
    await client.getByInitiator('0xalice');
    expect(mockFetchAERByAddress).toHaveBeenCalledWith(
      expect.anything(),
      config,
      '0xalice',
      'initiator',
      undefined,
    );
  });

  it('getByExecutor delegates with role=executor', async () => {
    mockFetchAERByAddress.mockResolvedValueOnce([makeRecord()]);

    const client = new AERClient({ config });
    await client.getByExecutor('0xexec');
    expect(mockFetchAERByAddress).toHaveBeenCalledWith(
      expect.anything(),
      config,
      '0xexec',
      'executor',
      undefined,
    );
  });

  it('getByBudgetId delegates to fetchAERByBudgetId', async () => {
    mockFetchAERByBudgetId.mockResolvedValueOnce([makeRecord()]);

    const client = new AERClient({ config });
    await client.getByBudgetId('0xbudget');
    expect(mockFetchAERByBudgetId).toHaveBeenCalledWith(
      expect.anything(),
      config,
      '0xbudget',
      undefined,
    );
  });

  it('getBudgetUtilization fetches and computes utilization', async () => {
    const records = [
      makeRecord({ budgetId: '0xbudget', paymentAmount: 3_000_000, budgetRemaining: 50_000_000, settledAt: 1000 }),
      makeRecord({ budgetId: '0xbudget', paymentAmount: 2_000_000, budgetRemaining: 48_000_000, settledAt: 2000 }),
    ];
    mockFetchAERByBudgetId.mockResolvedValueOnce(records);

    const client = new AERClient({ config });
    const u = await client.getBudgetUtilization('0xbudget');
    expect(u.budgetId).toBe('0xbudget');
    expect(u.totalRecords).toBe(2);
    expect(u.totalSpent).toBe(5_000_000);
  });

  it('traceChainBackward delegates to chain service', async () => {
    const chain = [makeRecord({ objectId: '0xroot' }), makeRecord({ objectId: '0xleaf' })];
    mockTraceChainBackward.mockResolvedValueOnce(chain);

    const client = new AERClient({ config });
    const result = await client.traceChainBackward('0xleaf');
    expect(result).toHaveLength(2);
  });

  it('traceChainForward delegates to chain service', async () => {
    const chain = [makeRecord({ objectId: '0xroot' }), makeRecord({ objectId: '0xchild' })];
    mockTraceChainForward.mockResolvedValueOnce(chain);

    const client = new AERClient({ config });
    const result = await client.traceChainForward('0xroot');
    expect(result).toHaveLength(2);
  });

  // Analytics methods (synchronous, no mocking needed)
  it('summarize works correctly', () => {
    const client = new AERClient({ config });
    const records = [makeRecord(), makeRecord({ paymentAmount: 3_000_000 })];
    const summary = client.summarize(records);
    expect(summary.totalRecords).toBe(2);
    expect(summary.totalPaymentNusdc).toBe(8_000_000);
  });

  it('groupBy works correctly', () => {
    const client = new AERClient({ config });
    const records = [
      makeRecord({ modelName: 'gpt-4o' }),
      makeRecord({ modelName: 'claude-3' }),
      makeRecord({ modelName: 'gpt-4o' }),
    ];
    const groups = client.groupBy(records, 'modelName');
    expect(groups.size).toBe(2);
    expect(groups.get('gpt-4o')?.length).toBe(2);
  });

  it('spendingTimeline works correctly', () => {
    const client = new AERClient({ config });
    const records = [makeRecord({ settledAt: 1700000000000, paymentAmount: 5_000_000 })];
    const timeline = client.spendingTimeline(records, 'hour');
    expect(timeline.length).toBe(1);
    expect(timeline[0].totalSpent).toBe(5_000_000);
  });

  it('trustProfile works correctly', () => {
    const client = new AERClient({ config });
    const records = [makeRecord({ teeVerified: true }), makeRecord({ teeVerified: false })];
    const profile = client.trustProfile(records);
    expect(profile.teeVerifiedPercentage).toBe(50);
  });
});
