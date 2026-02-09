import { describe, it, expect, vi } from 'vitest';
import { traceChainBackward, traceChainForward } from '../services/chain';
import type { AERConfig } from '../config';
import type { AERRecord } from '../types/aer';

// Mock fetch services
vi.mock('../services/fetch', () => ({
  fetchAERObject: vi.fn(),
  fetchRecentAEREvents: vi.fn(),
}));

import { fetchAERObject, fetchRecentAEREvents } from '../services/fetch';

const mockFetchAERObject = vi.mocked(fetchAERObject);
const mockFetchRecentAEREvents = vi.mocked(fetchRecentAEREvents);

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

const mockClient = {} as Parameters<typeof traceChainBackward>[0];
const mockConfig: AERConfig = {
  rpcUrl: 'https://rpc.devnet.nasun.io',
  aer: {
    packageId: '0xpackage',
    registryId: '0xregistry',
  },
};

describe('traceChainBackward', () => {
  it('returns single-element chain for root record (no triggeredBy)', async () => {
    const root = makeRecord({ objectId: '0xroot', triggeredBy: null });
    mockFetchAERObject.mockResolvedValueOnce(root);

    const chain = await traceChainBackward(mockClient, mockConfig, '0xroot');
    expect(chain).toHaveLength(1);
    expect(chain[0].objectId).toBe('0xroot');
  });

  it('traces chain backward to root', async () => {
    const root = makeRecord({ objectId: '0xroot', triggeredBy: null });
    const mid = makeRecord({ objectId: '0xmid', triggeredBy: '0xroot' });
    const leaf = makeRecord({ objectId: '0xleaf', triggeredBy: '0xmid' });

    mockFetchAERObject
      .mockResolvedValueOnce(leaf)   // start from leaf
      .mockResolvedValueOnce(mid)    // follow triggeredBy
      .mockResolvedValueOnce(root);  // reach root

    const chain = await traceChainBackward(mockClient, mockConfig, '0xleaf');
    expect(chain).toHaveLength(3);
    // Root first (reversed)
    expect(chain[0].objectId).toBe('0xroot');
    expect(chain[1].objectId).toBe('0xmid');
    expect(chain[2].objectId).toBe('0xleaf');
  });

  it('handles circular references gracefully', async () => {
    const a = makeRecord({ objectId: '0xa', triggeredBy: '0xb' });
    const b = makeRecord({ objectId: '0xb', triggeredBy: '0xa' });

    mockFetchAERObject
      .mockResolvedValueOnce(a)
      .mockResolvedValueOnce(b);

    const chain = await traceChainBackward(mockClient, mockConfig, '0xa');
    expect(chain).toHaveLength(2);
  });

  it('throws ChainDepthExceededError when exceeding maxDepth', async () => {
    // Create a chain deeper than maxDepth
    mockFetchAERObject
      .mockResolvedValueOnce(makeRecord({ objectId: '0x1', triggeredBy: '0x2' }))
      .mockResolvedValueOnce(makeRecord({ objectId: '0x2', triggeredBy: '0x3' }))
      .mockResolvedValueOnce(makeRecord({ objectId: '0x3', triggeredBy: '0x4' }));

    await expect(
      traceChainBackward(mockClient, mockConfig, '0x1', 2),
    ).rejects.toThrow('max depth');
  });
});

describe('traceChainForward', () => {
  it('returns single-element chain when no children found', async () => {
    const root = makeRecord({ objectId: '0xroot', triggeredBy: null });
    mockFetchAERObject.mockResolvedValueOnce(root);
    mockFetchRecentAEREvents.mockResolvedValueOnce({
      data: [],
      hasNextPage: false,
      nextCursor: null,
    });

    const chain = await traceChainForward(mockClient, mockConfig, '0xroot');
    expect(chain).toHaveLength(1);
    expect(chain[0].objectId).toBe('0xroot');
  });

  it('traces chain forward to children', async () => {
    const root = makeRecord({ objectId: '0xroot', triggeredBy: null });
    const child1 = makeRecord({ objectId: '0xchild1', triggeredBy: '0xroot' });
    const child2 = makeRecord({ objectId: '0xchild2', triggeredBy: '0xroot' });

    mockFetchAERObject.mockResolvedValueOnce(root);
    mockFetchRecentAEREvents
      .mockResolvedValueOnce({
        data: [child1, child2],
        hasNextPage: false,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      });

    const chain = await traceChainForward(mockClient, mockConfig, '0xroot');
    expect(chain).toHaveLength(3);
    expect(chain[0].objectId).toBe('0xroot');
  });
});
