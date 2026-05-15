/**
 * Tests for findAccountsWhereGuardian()
 *
 * Verifies on-chain event-based guardian account discovery
 * with edge cases: deduplication, address normalization,
 * stale events, network errors, result capping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getSuiClient before any imports that use it
const mockGetObject = vi.fn();
const mockQueryEvents = vi.fn();

vi.mock('../sui/client', () => ({
  getSuiClient: vi.fn(() => ({
    getObject: mockGetObject,
    queryEvents: mockQueryEvents,
    getOwnedObjects: vi.fn(),
  })),
}));

import { findAccountsWhereGuardian } from '../core/nsa/client';
import type { NsaAccountState } from '../types/nsa';

// === Test Helpers ===

const GUARDIAN_ADDR = '0x' + 'aa'.repeat(32);
const OTHER_GUARDIAN = '0x' + 'bb'.repeat(32);

function makeAccountId(n: number): string {
  return '0x' + n.toString(16).padStart(64, '0');
}

function makeGuardiansUpdatedEvent(
  accountId: string,
  guardians: string[],
): { parsedJson: Record<string, unknown> } {
  return {
    parsedJson: {
      account_id: accountId,
      guardians,
      guardian_threshold: 2,
      recovery_owner: '0x' + 'ff'.repeat(32),
      updated_by: guardians[0] || '0x0',
      timestamp: Date.now(),
    },
  };
}

function makeAccountObjectResponse(
  objectId: string,
  guardians: string[],
  signerCount = 1,
): Record<string, unknown> {
  const signerEntries = Array.from({ length: signerCount }, (_, i) => ({
    fields: {
      key: '0x' + (i + 1).toString(16).padStart(64, '0'),
      value: {
        fields: {
          signer_type: 2,
          weight: 1,
          added_at: Date.now(),
          label: 'signer',
        },
      },
    },
  }));

  return {
    data: {
      content: {
        dataType: 'moveObject',
        fields: {
          signers: { fields: { contents: signerEntries } },
          threshold: 1,
          guardians,
          guardian_threshold: 2,
          recovery_owner: '0x' + 'ff'.repeat(32),
          nonce: 0,
          created_at: Date.now(),
        },
      },
    },
  };
}

function makeRecoveryInitiatedEvent(
  accountId: string,
  requestId: string,
): { parsedJson: Record<string, unknown> } {
  return {
    parsedJson: {
      account_id: accountId,
      request_id: requestId,
      requester: OTHER_GUARDIAN,
      new_owner: '0x' + 'ff'.repeat(32),
      timelock_end: Date.now() + 172800000,
    },
  };
}

function makeRecoveryObjectResponse(
  requestId: string,
  accountId: string,
  opts: { isExecuted?: boolean; isCancelled?: boolean } = {},
): Record<string, unknown> {
  return {
    data: {
      content: {
        dataType: 'moveObject',
        fields: {
          account_id: accountId,
          requester: OTHER_GUARDIAN,
          new_owner: '0x' + 'ff'.repeat(32),
          approvals: [],
          required_approvals: 2,
          timelock_end: Date.now() + 172800000,
          is_executed: opts.isExecuted ?? false,
          is_cancelled: opts.isCancelled ?? false,
          created_at: Date.now(),
        },
      },
    },
  };
}

// === Tests ===

beforeEach(() => {
  vi.clearAllMocks();
});

describe('findAccountsWhereGuardian', () => {
  it('should return empty array when no events found', async () => {
    mockQueryEvents.mockResolvedValue({ data: [], hasNextPage: false });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toEqual([]);
    expect(mockQueryEvents).toHaveBeenCalledTimes(1);
  });

  it('should discover a single guarded account', async () => {
    const accountId = makeAccountId(1);

    mockQueryEvents
      // GuardiansUpdated events
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN])],
        hasNextPage: false,
      })
      // RecoveryInitiated events (from findActiveRecoveryForAccount)
      .mockResolvedValueOnce({
        data: [],
        hasNextPage: false,
      });

    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN]),
    );

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(1);
    expect(results[0].accountState.objectId).toBe(accountId);
    expect(results[0].accountState.guardians).toContain(GUARDIAN_ADDR);
    expect(results[0].activeRecoveryId).toBeNull();
  });

  it('should discover multiple guarded accounts', async () => {
    const accountId1 = makeAccountId(1);
    const accountId2 = makeAccountId(2);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          makeGuardiansUpdatedEvent(accountId1, [GUARDIAN_ADDR]),
          makeGuardiansUpdatedEvent(accountId2, [GUARDIAN_ADDR, OTHER_GUARDIAN]),
        ],
        hasNextPage: false,
      })
      // Recovery check for account 1
      .mockResolvedValueOnce({ data: [], hasNextPage: false })
      // Recovery check for account 2
      .mockResolvedValueOnce({ data: [], hasNextPage: false });

    mockGetObject
      .mockResolvedValueOnce(makeAccountObjectResponse(accountId1, [GUARDIAN_ADDR]))
      .mockResolvedValueOnce(makeAccountObjectResponse(accountId2, [GUARDIAN_ADDR, OTHER_GUARDIAN]));

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.accountState.objectId)).toEqual(
      expect.arrayContaining([accountId1, accountId2]),
    );
  });

  it('should deduplicate events for the same account', async () => {
    const accountId = makeAccountId(1);

    // Same account emitted GuardiansUpdated twice (e.g., guardian added then threshold changed)
    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR]),
          makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN]),
        ],
        hasNextPage: false,
      })
      .mockResolvedValueOnce({ data: [], hasNextPage: false });

    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN]),
    );

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    // Should only appear once despite 2 events
    expect(results).toHaveLength(1);
    // getObject should only be called once (dedup before verification)
    expect(mockGetObject).toHaveBeenCalledTimes(1);
  });

  it('should perform case-insensitive address matching on events', async () => {
    const accountId = makeAccountId(1);
    const upperCaseGuardian = GUARDIAN_ADDR.toUpperCase().replace('0X', '0x');

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [upperCaseGuardian])],
        hasNextPage: false,
      })
      .mockResolvedValueOnce({ data: [], hasNextPage: false });

    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [upperCaseGuardian]),
    );

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR.toLowerCase());

    expect(results).toHaveLength(1);
  });

  it('should filter out accounts where guardian was removed (stale event)', async () => {
    const accountId = makeAccountId(1);

    // Event says GUARDIAN_ADDR is a guardian
    mockQueryEvents.mockResolvedValueOnce({
      data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN])],
      hasNextPage: false,
    });

    // But current on-chain state no longer includes GUARDIAN_ADDR
    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [OTHER_GUARDIAN]),
    );

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(0);
    // Verified that getObject was called (on-chain check happened)
    expect(mockGetObject).toHaveBeenCalledTimes(1);
  });

  it('should skip events where guardian address does not match', async () => {
    const accountId = makeAccountId(1);

    mockQueryEvents.mockResolvedValueOnce({
      data: [makeGuardiansUpdatedEvent(accountId, [OTHER_GUARDIAN])],
      hasNextPage: false,
    });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(0);
    // getObject should not be called since event was filtered
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('should skip events with missing parsedJson', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [{ parsedJson: undefined }, { parsedJson: null }],
      hasNextPage: false,
    });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(0);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('should skip events with missing account_id', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [{
        parsedJson: {
          guardians: [GUARDIAN_ADDR],
          // account_id is missing
        },
      }],
      hasNextPage: false,
    });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(0);
  });

  it('should skip events with missing guardians field', async () => {
    const accountId = makeAccountId(1);
    mockQueryEvents.mockResolvedValueOnce({
      data: [{
        parsedJson: {
          account_id: accountId,
          // guardians field missing
        },
      }],
      hasNextPage: false,
    });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(0);
  });

  it('should handle fetchAccountState failure gracefully', async () => {
    const accountId1 = makeAccountId(1);
    const accountId2 = makeAccountId(2);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [
          makeGuardiansUpdatedEvent(accountId1, [GUARDIAN_ADDR]),
          makeGuardiansUpdatedEvent(accountId2, [GUARDIAN_ADDR]),
        ],
        hasNextPage: false,
      })
      // Recovery for account 2 only (account 1 fails before recovery check)
      .mockResolvedValueOnce({ data: [], hasNextPage: false });

    // Account 1 fails, account 2 succeeds
    mockGetObject
      .mockRejectedValueOnce(new Error('Network timeout'))
      .mockResolvedValueOnce(makeAccountObjectResponse(accountId2, [GUARDIAN_ADDR]));

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    // Only account 2 should be returned
    expect(results).toHaveLength(1);
    expect(results[0].accountState.objectId).toBe(accountId2);
  });

  it('should handle findActiveRecoveryForAccount failure gracefully', async () => {
    const accountId = makeAccountId(1);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR])],
        hasNextPage: false,
      })
      // Recovery query fails
      .mockRejectedValueOnce(new Error('RPC error'));

    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [GUARDIAN_ADDR]),
    );

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    // Account should still be returned with null activeRecoveryId
    expect(results).toHaveLength(1);
    expect(results[0].activeRecoveryId).toBeNull();
  });

  it('should include activeRecoveryId when recovery is active', async () => {
    const accountId = makeAccountId(1);
    const recoveryId = makeAccountId(99);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR])],
        hasNextPage: false,
      })
      // RecoveryInitiated events for findActiveRecoveryForAccount
      .mockResolvedValueOnce({
        data: [makeRecoveryInitiatedEvent(accountId, recoveryId)],
        hasNextPage: false,
      });

    mockGetObject
      // fetchAccountState
      .mockResolvedValueOnce(makeAccountObjectResponse(accountId, [GUARDIAN_ADDR]))
      // fetchRecoveryRequest (inside findActiveRecoveryForAccount)
      .mockResolvedValueOnce(makeRecoveryObjectResponse(recoveryId, accountId));

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(1);
    expect(results[0].activeRecoveryId).toBe(recoveryId);
  });

  it('should not include executed/cancelled recovery as active', async () => {
    const accountId = makeAccountId(1);
    const recoveryId = makeAccountId(99);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR])],
        hasNextPage: false,
      })
      .mockResolvedValueOnce({
        data: [makeRecoveryInitiatedEvent(accountId, recoveryId)],
        hasNextPage: false,
      });

    mockGetObject
      .mockResolvedValueOnce(makeAccountObjectResponse(accountId, [GUARDIAN_ADDR]))
      // Recovery is executed
      .mockResolvedValueOnce(makeRecoveryObjectResponse(recoveryId, accountId, { isExecuted: true }));

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(1);
    expect(results[0].activeRecoveryId).toBeNull();
  });

  it('should cap results at MAX_RESULTS (10)', async () => {
    // Create 15 events for different accounts
    const events = Array.from({ length: 15 }, (_, i) =>
      makeGuardiansUpdatedEvent(makeAccountId(i + 1), [GUARDIAN_ADDR]),
    );

    mockQueryEvents
      .mockResolvedValueOnce({ data: events, hasNextPage: false })
      // Recovery queries for up to 10 accounts
      .mockResolvedValue({ data: [], hasNextPage: false });

    // All accounts verify successfully
    mockGetObject.mockImplementation(async (params: { id: string }) => {
      return makeAccountObjectResponse(params.id, [GUARDIAN_ADDR]);
    });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    // Should be capped at 10
    expect(results.length).toBeLessThanOrEqual(10);
    // getObject should be called at most 10 times (not 15)
    expect(mockGetObject.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('should handle complete queryEvents failure', async () => {
    mockQueryEvents.mockRejectedValueOnce(new Error('Network unreachable'));

    await expect(findAccountsWhereGuardian(GUARDIAN_ADDR)).rejects.toThrow('Network unreachable');
  });

  it('should handle empty guardians array in event', async () => {
    const accountId = makeAccountId(1);
    mockQueryEvents.mockResolvedValueOnce({
      data: [{
        parsedJson: {
          account_id: accountId,
          guardians: [],
        },
      }],
      hasNextPage: false,
    });

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(0);
  });

  it('should preserve accountState details in result', async () => {
    const accountId = makeAccountId(1);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN])],
        hasNextPage: false,
      })
      .mockResolvedValueOnce({ data: [], hasNextPage: false });

    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [GUARDIAN_ADDR, OTHER_GUARDIAN], 2),
    );

    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR);

    expect(results).toHaveLength(1);
    const state = results[0].accountState;
    expect(state.objectId).toBe(accountId);
    expect(state.signers).toHaveLength(2);
    expect(state.guardians).toHaveLength(2);
    expect(state.guardianThreshold).toBe(2);
    expect(state.recoveryOwner).toBe('0x' + 'ff'.repeat(32));
  });

  it('should handle mixed-case addresses in on-chain state verification', async () => {
    const accountId = makeAccountId(1);
    // Event has lowercase, chain has mixed case
    const mixedCaseGuardian = '0x' + 'Aa'.repeat(32);

    mockQueryEvents
      .mockResolvedValueOnce({
        data: [makeGuardiansUpdatedEvent(accountId, [GUARDIAN_ADDR])],
        hasNextPage: false,
      })
      .mockResolvedValueOnce({ data: [], hasNextPage: false });

    // On-chain state returns mixed-case
    mockGetObject.mockResolvedValueOnce(
      makeAccountObjectResponse(accountId, [mixedCaseGuardian]),
    );

    // Query with lowercase
    const results = await findAccountsWhereGuardian(GUARDIAN_ADDR.toLowerCase());

    expect(results).toHaveLength(1);
  });
});
