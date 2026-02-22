import { describe, it, expect, vi, beforeEach } from 'vitest';
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

vi.mock('../services/indexer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/indexer')>();
  return {
    ...actual,
    indexerGetRecent: vi.fn(),
    indexerGetByAddress: vi.fn(),
    indexerGetByBudgetId: vi.fn(),
    indexerTraceChain: vi.fn(),
  };
});

import {
  fetchAERObject,
  fetchAERByRequestId,
  fetchRecentAEREvents,
  fetchAERByAddress,
  fetchAERByBudgetId,
} from '../services/fetch';
import { traceChainBackward, traceChainForward } from '../services/chain';
import {
  indexerGetRecent,
  indexerGetByAddress,
  indexerGetByBudgetId,
  indexerTraceChain,
  IndexerError,
} from '../services/indexer';

const mockFetchAERObject = vi.mocked(fetchAERObject);
const mockFetchAERByRequestId = vi.mocked(fetchAERByRequestId);
const mockFetchRecentAEREvents = vi.mocked(fetchRecentAEREvents);
const mockFetchAERByAddress = vi.mocked(fetchAERByAddress);
const mockFetchAERByBudgetId = vi.mocked(fetchAERByBudgetId);
const mockTraceChainBackward = vi.mocked(traceChainBackward);
const mockTraceChainForward = vi.mocked(traceChainForward);
const mockIndexerGetRecent = vi.mocked(indexerGetRecent);
const mockIndexerGetByAddress = vi.mocked(indexerGetByAddress);
const mockIndexerGetByBudgetId = vi.mocked(indexerGetByBudgetId);
const mockIndexerTraceChain = vi.mocked(indexerTraceChain);

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

// ===== withFallback tests =====

describe('AERClient withFallback (indexer → RPC)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const INDEXER_URL = 'http://localhost:3201';
  const indexerPaginatedResult = {
    data: [makeRecord({ objectId: '0xfromIndexer' })],
    hasNextPage: false,
    nextCursor: null,
  };
  const rpcPaginatedResult = {
    data: [makeRecord({ objectId: '0xfromRpc' })],
    hasNextPage: false,
    nextCursor: null,
  };

  it('uses indexer when indexerUrl is set and indexer succeeds', async () => {
    mockIndexerGetRecent.mockResolvedValueOnce(indexerPaginatedResult);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.getRecent({ limit: 10 });

    expect(result.data[0].objectId).toBe('0xfromIndexer');
    expect(mockIndexerGetRecent).toHaveBeenCalled();
    expect(mockFetchRecentAEREvents).not.toHaveBeenCalled();
  });

  it('falls back to RPC when indexer fails with 5xx error', async () => {
    mockIndexerGetRecent.mockRejectedValueOnce(new IndexerError('Server error', 500));
    mockFetchRecentAEREvents.mockResolvedValueOnce(rpcPaginatedResult);

    const onFallback = vi.fn();
    const client = new AERClient({ config, indexerUrl: INDEXER_URL, onFallback });
    const result = await client.getRecent({ limit: 10 });

    expect(result.data[0].objectId).toBe('0xfromRpc');
    expect(onFallback).toHaveBeenCalledWith('getRecent', expect.any(IndexerError));
  });

  it('falls back to RPC on network timeout', async () => {
    mockIndexerGetRecent.mockRejectedValueOnce(new IndexerError('Timeout', 0));
    mockFetchRecentAEREvents.mockResolvedValueOnce(rpcPaginatedResult);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.getRecent();

    expect(result.data[0].objectId).toBe('0xfromRpc');
  });

  it('throws on 4xx error (no fallback)', async () => {
    mockIndexerGetRecent.mockRejectedValueOnce(new IndexerError('Bad request', 400));

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    await expect(client.getRecent()).rejects.toThrow('Bad request');
    expect(mockFetchRecentAEREvents).not.toHaveBeenCalled();
  });

  it('uses RPC directly when indexerUrl is not set', async () => {
    mockFetchRecentAEREvents.mockResolvedValueOnce(rpcPaginatedResult);

    const client = new AERClient({ config }); // no indexerUrl
    const result = await client.getRecent();

    expect(result.data[0].objectId).toBe('0xfromRpc');
    expect(mockIndexerGetRecent).not.toHaveBeenCalled();
  });

  it('withFallback works for getByInitiator', async () => {
    const records = [makeRecord({ objectId: '0xidxInit' })];
    mockIndexerGetByAddress.mockResolvedValueOnce(records);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.getByInitiator('0xalice');

    expect(result[0].objectId).toBe('0xidxInit');
    expect(mockIndexerGetByAddress).toHaveBeenCalledWith(
      INDEXER_URL, 5000, '0xalice', 'initiator', undefined,
    );
  });

  it('withFallback works for getByExecutor with fallback', async () => {
    mockIndexerGetByAddress.mockRejectedValueOnce(new IndexerError('Down', 503));
    mockFetchAERByAddress.mockResolvedValueOnce([makeRecord({ objectId: '0xrpcExec' })]);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.getByExecutor('0xexec');

    expect(result[0].objectId).toBe('0xrpcExec');
  });

  it('withFallback works for getByBudgetId', async () => {
    const records = [makeRecord({ objectId: '0xidxBudget' })];
    mockIndexerGetByBudgetId.mockResolvedValueOnce(records);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.getByBudgetId('0xbudget');

    expect(result[0].objectId).toBe('0xidxBudget');
  });

  it('withFallback works for traceChainBackward', async () => {
    const chain = [makeRecord({ objectId: '0xroot' }), makeRecord({ objectId: '0xleaf' })];
    mockIndexerTraceChain.mockResolvedValueOnce(chain);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.traceChainBackward('0xleaf', 10);

    expect(result).toHaveLength(2);
    expect(mockIndexerTraceChain).toHaveBeenCalledWith(
      INDEXER_URL, 5000, '0xleaf', 'backward', 10,
    );
  });

  it('withFallback works for traceChainForward with fallback', async () => {
    mockIndexerTraceChain.mockRejectedValueOnce(new IndexerError('Error', 502));
    mockTraceChainForward.mockResolvedValueOnce([makeRecord({ objectId: '0xfwd' })]);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL });
    const result = await client.traceChainForward('0xroot');

    expect(result[0].objectId).toBe('0xfwd');
  });

  it('custom indexerTimeoutMs is passed to indexer functions', async () => {
    mockIndexerGetRecent.mockResolvedValueOnce(indexerPaginatedResult);

    const client = new AERClient({ config, indexerUrl: INDEXER_URL, indexerTimeoutMs: 3000 });
    await client.getRecent();

    expect(mockIndexerGetRecent).toHaveBeenCalledWith(INDEXER_URL, 3000, undefined);
  });
});
