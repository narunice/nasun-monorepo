/**
 * NSA Guardian Configuration & Recovery Tests
 *
 * Tests for:
 * - validateGuardianConfig (pre-set validation)
 * - computeRecoveryStatus (status state machine)
 * - getTimelockRemainingMs / formatTimelockRemaining
 * - hasApproved / getRemainingApprovalsNeeded
 * - canExecuteRecovery / canCancelRecovery
 * - computeTimelockEnd
 * - buildSetGuardians / buildInitiateRecovery / buildApproveRecovery /
 *   buildExecuteRecovery / buildCancelRecovery (transaction builders)
 * - findActiveRecoveryForAccount (event-based query)
 * - fetchRecoveryRequest (on-chain query)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateGuardianConfig,
  computeRecoveryStatus,
  getTimelockRemainingMs,
  formatTimelockRemaining,
  hasApproved,
  getRemainingApprovalsNeeded,
  canExecuteRecovery,
  canCancelRecovery,
  computeTimelockEnd,
} from '../recovery';
import { NSA_TIMELOCK_MS } from '../../../types/nsa';
import type {
  NsaRecoveryRequestState,
  NsaAccountState,
} from '../../../types/nsa';

// === Test Fixtures ===

const ADDR_A = '0x' + 'a'.repeat(64);
const ADDR_B = '0x' + 'b'.repeat(64);
const ADDR_C = '0x' + 'c'.repeat(64);
const ADDR_D = '0x' + 'd'.repeat(64);
const ADDR_E = '0x' + 'e'.repeat(64);
const ADDR_F = '0x' + 'f'.repeat(64);
const ADDR_SIGNER = '0x' + '1'.repeat(64);

function makeRecoveryRequest(
  overrides: Partial<NsaRecoveryRequestState> = {},
): NsaRecoveryRequestState {
  return {
    objectId: '0x' + 'r'.repeat(64),
    accountId: '0x' + 'a'.repeat(64),
    requester: ADDR_A,
    newOwner: ADDR_B,
    approvals: [],
    requiredApprovals: 2,
    timelockEnd: Date.now() + NSA_TIMELOCK_MS,
    isExecuted: false,
    isCancelled: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeAccountState(
  overrides: Partial<NsaAccountState> = {},
): NsaAccountState {
  return {
    objectId: '0x' + 'a'.repeat(64),
    signers: [
      {
        address: ADDR_SIGNER,
        signerType: 'local',
        weight: 1,
        addedAt: Date.now(),
        label: 'primary',
      },
    ],
    threshold: 1,
    guardians: [ADDR_A, ADDR_B, ADDR_C],
    guardianThreshold: 2,
    recoveryOwner: ADDR_B,
    nonce: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

// ============================================
// validateGuardianConfig
// ============================================

describe('validateGuardianConfig', () => {
  const signers = [ADDR_SIGNER];

  // --- Valid configurations ---

  it('accepts clearing guardians (empty array + threshold 0)', () => {
    const result = validateGuardianConfig([], 0, signers);
    expect(result.valid).toBe(true);
  });

  it('accepts minimum valid configuration (2 guardians, threshold 2)', () => {
    const result = validateGuardianConfig([ADDR_A, ADDR_B], 2, signers);
    expect(result.valid).toBe(true);
  });

  it('accepts 3 guardians with threshold 2', () => {
    const result = validateGuardianConfig(
      [ADDR_A, ADDR_B, ADDR_C],
      2,
      signers,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts 5 guardians (maximum) with threshold 3', () => {
    const result = validateGuardianConfig(
      [ADDR_A, ADDR_B, ADDR_C, ADDR_D, ADDR_E],
      3,
      signers,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts threshold equal to guardian count', () => {
    const result = validateGuardianConfig(
      [ADDR_A, ADDR_B, ADDR_C],
      3,
      signers,
    );
    expect(result.valid).toBe(true);
  });

  // --- Invalid: threshold violations ---

  it('rejects threshold 0 with non-empty guardians', () => {
    const result = validateGuardianConfig([ADDR_A, ADDR_B], 0, signers);
    expect(result.valid).toBe(false);
    // Threshold < 2
  });

  it('rejects threshold 1 (minimum is 2)', () => {
    const result = validateGuardianConfig([ADDR_A, ADDR_B], 1, signers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('at least 2');
  });

  it('rejects threshold exceeding guardian count', () => {
    const result = validateGuardianConfig([ADDR_A, ADDR_B], 3, signers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceed');
  });

  it('rejects threshold with no guardians', () => {
    const result = validateGuardianConfig([], 2, signers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('no guardians');
  });

  // --- Invalid: count violations ---

  it('rejects more than 5 guardians', () => {
    const sixGuardians = [ADDR_A, ADDR_B, ADDR_C, ADDR_D, ADDR_E, ADDR_F];
    const result = validateGuardianConfig(sixGuardians, 3, signers);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Maximum 5');
  });

  // --- Invalid: overlap violations ---

  it('rejects guardian that is also a signer', () => {
    const result = validateGuardianConfig(
      [ADDR_SIGNER, ADDR_B],
      2,
      signers,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('also a signer');
  });

  it('rejects when any guardian overlaps with any signer (multiple signers)', () => {
    const multipleSigners = [ADDR_SIGNER, ADDR_A];
    const result = validateGuardianConfig(
      [ADDR_A, ADDR_B, ADDR_C],
      2,
      multipleSigners,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain(ADDR_A);
  });

  // --- Invalid: duplicate violations ---

  it('rejects duplicate guardian addresses', () => {
    const result = validateGuardianConfig(
      [ADDR_A, ADDR_A, ADDR_B],
      2,
      signers,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  it('rejects all-same guardian addresses', () => {
    const result = validateGuardianConfig(
      [ADDR_A, ADDR_A],
      2,
      signers,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  // --- Edge: empty signers list ---

  it('accepts when signer list is empty (no overlap possible)', () => {
    const result = validateGuardianConfig([ADDR_A, ADDR_B], 2, []);
    expect(result.valid).toBe(true);
  });
});

// ============================================
// computeRecoveryStatus
// ============================================

describe('computeRecoveryStatus', () => {
  it('returns "executed" for executed request', () => {
    const req = makeRecoveryRequest({ isExecuted: true });
    expect(computeRecoveryStatus(req)).toBe('executed');
  });

  it('returns "cancelled" for cancelled request', () => {
    const req = makeRecoveryRequest({ isCancelled: true });
    expect(computeRecoveryStatus(req)).toBe('cancelled');
  });

  it('returns "executed" even if also cancelled (executed takes priority)', () => {
    const req = makeRecoveryRequest({
      isExecuted: true,
      isCancelled: true,
    });
    expect(computeRecoveryStatus(req)).toBe('executed');
  });

  it('returns "timelock_active" when timelock not expired and insufficient approvals', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now + 10000,
      approvals: [ADDR_A], // 1 of 2 needed
      requiredApprovals: 2,
    });
    expect(computeRecoveryStatus(req, now)).toBe('timelock_active');
  });

  it('returns "timelock_active" when timelock not expired even with enough approvals', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now + 10000,
      approvals: [ADDR_A, ADDR_B], // 2 of 2
      requiredApprovals: 2,
    });
    // Still timelock_active because timelock hasn't expired
    expect(computeRecoveryStatus(req, now)).toBe('timelock_active');
  });

  it('returns "pending_approvals" when timelock expired but not enough approvals', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now - 10000, // Expired
      approvals: [ADDR_A], // 1 of 2
      requiredApprovals: 2,
    });
    expect(computeRecoveryStatus(req, now)).toBe('pending_approvals');
  });

  it('returns "ready_to_execute" when timelock expired AND enough approvals', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now - 10000, // Expired
      approvals: [ADDR_A, ADDR_B], // 2 of 2
      requiredApprovals: 2,
    });
    expect(computeRecoveryStatus(req, now)).toBe('ready_to_execute');
  });

  it('returns "ready_to_execute" with more approvals than required', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now - 1,
      approvals: [ADDR_A, ADDR_B, ADDR_C], // 3 of 2
      requiredApprovals: 2,
    });
    expect(computeRecoveryStatus(req, now)).toBe('ready_to_execute');
  });

  it('returns "ready_to_execute" at exact timelock boundary', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now, // Exactly now (>= check)
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
    });
    expect(computeRecoveryStatus(req, now)).toBe('ready_to_execute');
  });

  it('handles zero required approvals (trivial threshold)', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now - 1,
      approvals: [],
      requiredApprovals: 0,
    });
    expect(computeRecoveryStatus(req, now)).toBe('ready_to_execute');
  });
});

// ============================================
// getTimelockRemainingMs
// ============================================

describe('getTimelockRemainingMs', () => {
  it('returns positive value when timelock is in the future', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now + 60000 });
    expect(getTimelockRemainingMs(req, now)).toBe(60000);
  });

  it('returns 0 when timelock has expired', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now - 1 });
    expect(getTimelockRemainingMs(req, now)).toBe(0);
  });

  it('returns 0 at exact expiry time', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now });
    expect(getTimelockRemainingMs(req, now)).toBe(0);
  });

  it('never returns negative values', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now - 999999 });
    expect(getTimelockRemainingMs(req, now)).toBe(0);
  });

  it('returns full timelock duration for freshly created request', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now + NSA_TIMELOCK_MS });
    const remaining = getTimelockRemainingMs(req, now);
    expect(remaining).toBe(NSA_TIMELOCK_MS);
  });
});

// ============================================
// formatTimelockRemaining
// ============================================

describe('formatTimelockRemaining', () => {
  it('returns "Expired" when timelock has passed', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now - 1 });
    expect(formatTimelockRemaining(req, now)).toBe('Expired');
  });

  it('formats hours and minutes correctly', () => {
    const now = Date.now();
    // 2 hours 30 minutes remaining
    const req = makeRecoveryRequest({
      timelockEnd: now + 2.5 * 60 * 60 * 1000,
    });
    expect(formatTimelockRemaining(req, now)).toBe('2h 30m remaining');
  });

  it('formats minutes only when less than 1 hour', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now + 45 * 60 * 1000,
    });
    expect(formatTimelockRemaining(req, now)).toBe('45m remaining');
  });

  it('formats full 48-hour timelock', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      timelockEnd: now + NSA_TIMELOCK_MS,
    });
    expect(formatTimelockRemaining(req, now)).toBe('48h 0m remaining');
  });

  it('shows 0m for very short durations (< 1 min)', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({ timelockEnd: now + 30000 }); // 30 sec
    expect(formatTimelockRemaining(req, now)).toBe('0m remaining');
  });
});

// ============================================
// hasApproved
// ============================================

describe('hasApproved', () => {
  it('returns true when address is in approvals', () => {
    const req = makeRecoveryRequest({ approvals: [ADDR_A, ADDR_B] });
    expect(hasApproved(req, ADDR_A)).toBe(true);
  });

  it('returns false when address is not in approvals', () => {
    const req = makeRecoveryRequest({ approvals: [ADDR_A] });
    expect(hasApproved(req, ADDR_B)).toBe(false);
  });

  it('returns false for empty approvals', () => {
    const req = makeRecoveryRequest({ approvals: [] });
    expect(hasApproved(req, ADDR_A)).toBe(false);
  });

  it('is case-sensitive (addresses must match exactly)', () => {
    const req = makeRecoveryRequest({ approvals: [ADDR_A] });
    // Uppercase won't match lowercase
    expect(hasApproved(req, ADDR_A.toUpperCase())).toBe(false);
  });
});

// ============================================
// getRemainingApprovalsNeeded
// ============================================

describe('getRemainingApprovalsNeeded', () => {
  it('returns full count when no approvals', () => {
    const req = makeRecoveryRequest({
      approvals: [],
      requiredApprovals: 3,
    });
    expect(getRemainingApprovalsNeeded(req)).toBe(3);
  });

  it('returns remaining count with partial approvals', () => {
    const req = makeRecoveryRequest({
      approvals: [ADDR_A],
      requiredApprovals: 3,
    });
    expect(getRemainingApprovalsNeeded(req)).toBe(2);
  });

  it('returns 0 when threshold met', () => {
    const req = makeRecoveryRequest({
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
    });
    expect(getRemainingApprovalsNeeded(req)).toBe(0);
  });

  it('returns 0 when approvals exceed threshold (never negative)', () => {
    const req = makeRecoveryRequest({
      approvals: [ADDR_A, ADDR_B, ADDR_C],
      requiredApprovals: 2,
    });
    expect(getRemainingApprovalsNeeded(req)).toBe(0);
  });

  it('returns 0 when requiredApprovals is 0', () => {
    const req = makeRecoveryRequest({
      approvals: [],
      requiredApprovals: 0,
    });
    expect(getRemainingApprovalsNeeded(req)).toBe(0);
  });
});

// ============================================
// canExecuteRecovery
// ============================================

describe('canExecuteRecovery', () => {
  it('returns true when threshold met and timelock expired', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
      timelockEnd: now - 1,
    });
    expect(canExecuteRecovery(req, now)).toBe(true);
  });

  it('returns false when threshold not met', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      approvals: [ADDR_A],
      requiredApprovals: 2,
      timelockEnd: now - 1,
    });
    expect(canExecuteRecovery(req, now)).toBe(false);
  });

  it('returns false when timelock not expired', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
      timelockEnd: now + 10000,
    });
    expect(canExecuteRecovery(req, now)).toBe(false);
  });

  it('returns false for executed request', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      isExecuted: true,
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
      timelockEnd: now - 1,
    });
    expect(canExecuteRecovery(req, now)).toBe(false);
  });

  it('returns false for cancelled request', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      isCancelled: true,
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
      timelockEnd: now - 1,
    });
    expect(canExecuteRecovery(req, now)).toBe(false);
  });

  it('returns true at exact timelock boundary', () => {
    const now = Date.now();
    const req = makeRecoveryRequest({
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
      timelockEnd: now, // >= check
    });
    expect(canExecuteRecovery(req, now)).toBe(true);
  });
});

// ============================================
// canCancelRecovery
// ============================================

describe('canCancelRecovery', () => {
  it('returns true when caller is a signer', () => {
    const req = makeRecoveryRequest();
    const account = makeAccountState();

    expect(canCancelRecovery(req, account, ADDR_SIGNER)).toBe(true);
  });

  it('returns false when caller is not a signer', () => {
    const req = makeRecoveryRequest();
    const account = makeAccountState();

    expect(canCancelRecovery(req, account, ADDR_A)).toBe(false);
  });

  it('returns false for executed request even if caller is signer', () => {
    const req = makeRecoveryRequest({ isExecuted: true });
    const account = makeAccountState();

    expect(canCancelRecovery(req, account, ADDR_SIGNER)).toBe(false);
  });

  it('returns false for cancelled request', () => {
    const req = makeRecoveryRequest({ isCancelled: true });
    const account = makeAccountState();

    expect(canCancelRecovery(req, account, ADDR_SIGNER)).toBe(false);
  });

  it('checks against all signers (multi-signer account)', () => {
    const signer2 = '0x' + '2'.repeat(64);
    const req = makeRecoveryRequest();
    const account = makeAccountState({
      signers: [
        {
          address: ADDR_SIGNER,
          signerType: 'local',
          weight: 1,
          addedAt: Date.now(),
          label: 'primary',
        },
        {
          address: signer2,
          signerType: 'passkey',
          weight: 1,
          addedAt: Date.now(),
          label: 'backup',
        },
      ],
    });

    expect(canCancelRecovery(req, account, ADDR_SIGNER)).toBe(true);
    expect(canCancelRecovery(req, account, signer2)).toBe(true);
    expect(canCancelRecovery(req, account, ADDR_A)).toBe(false);
  });

  it('returns false when account has no signers', () => {
    const req = makeRecoveryRequest();
    const account = makeAccountState({ signers: [] });

    expect(canCancelRecovery(req, account, ADDR_SIGNER)).toBe(false);
  });
});

// ============================================
// computeTimelockEnd
// ============================================

describe('computeTimelockEnd', () => {
  it('adds 48 hours to start time', () => {
    const start = 1700000000000;
    expect(computeTimelockEnd(start)).toBe(start + NSA_TIMELOCK_MS);
  });

  it('uses Date.now() when no start time provided', () => {
    const before = Date.now();
    const result = computeTimelockEnd();
    const after = Date.now();

    expect(result).toBeGreaterThanOrEqual(before + NSA_TIMELOCK_MS);
    expect(result).toBeLessThanOrEqual(after + NSA_TIMELOCK_MS);
  });

  it('timelock is exactly 48 hours (172,800,000 ms)', () => {
    expect(NSA_TIMELOCK_MS).toBe(48 * 60 * 60 * 1000);
  });
});

// ============================================
// Transaction Builders (Guardian & Recovery)
// ============================================

const mockGetObject = vi.fn();
const mockQueryEvents = vi.fn();

vi.mock('../../../sui/client', () => ({
  getSuiClient: () => ({
    getObject: mockGetObject,
    queryEvents: mockQueryEvents,
  }),
}));

vi.mock('@nasun/devnet-config', () => ({
  NSA_PACKAGE_ID: '0xTEST_PKG',
  NSA_REGISTRY_ID: '0xTEST_REG',
}));

import {
  buildSetGuardians,
  buildInitiateRecovery,
  buildApproveRecovery,
  buildExecuteRecovery,
  buildCancelRecovery,
  fetchRecoveryRequest,
  findActiveRecoveryForAccount,
} from '../client';

describe('buildSetGuardians', () => {
  it('builds transaction with guardian addresses and threshold', () => {
    const tx = buildSetGuardians({
      accountObjectId: ADDR_A,
      guardians: [ADDR_B, ADDR_C],
      guardianThreshold: 2,
      recoveryOwner: ADDR_D,
    });
    expect(tx).toBeDefined();
    expect(typeof tx.serialize).toBe('function');
  });

  it('handles clearing guardians (empty array)', () => {
    const tx = buildSetGuardians({
      accountObjectId: ADDR_A,
      guardians: [],
      guardianThreshold: 0,
      recoveryOwner: ADDR_D,
    });
    expect(tx).toBeDefined();
  });

  it('handles maximum 5 guardians', () => {
    const tx = buildSetGuardians({
      accountObjectId: ADDR_A,
      guardians: [ADDR_A, ADDR_B, ADDR_C, ADDR_D, ADDR_E],
      guardianThreshold: 3,
      recoveryOwner: ADDR_F,
    });
    expect(tx).toBeDefined();
  });
});

describe('buildInitiateRecovery', () => {
  it('builds initiate recovery transaction', () => {
    const tx = buildInitiateRecovery({
      accountObjectId: ADDR_A,
      newOwner: ADDR_B,
    });
    expect(tx).toBeDefined();
  });
});

describe('buildApproveRecovery', () => {
  it('builds approve recovery transaction', () => {
    const tx = buildApproveRecovery({
      requestObjectId: '0x' + 'r'.repeat(64),
      accountObjectId: ADDR_A,
    });
    expect(tx).toBeDefined();
  });
});

describe('buildExecuteRecovery', () => {
  it('builds execute recovery transaction', () => {
    const tx = buildExecuteRecovery({
      requestObjectId: '0x' + 'r'.repeat(64),
      accountObjectId: ADDR_A,
    });
    expect(tx).toBeDefined();
  });
});

describe('buildCancelRecovery', () => {
  it('builds cancel recovery transaction', () => {
    const tx = buildCancelRecovery({
      requestObjectId: '0x' + 'r'.repeat(64),
      accountObjectId: ADDR_A,
    });
    expect(tx).toBeDefined();
  });
});

// ============================================
// fetchRecoveryRequest
// ============================================

describe('fetchRecoveryRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when object not found', async () => {
    mockGetObject.mockResolvedValueOnce({ data: null });

    await expect(
      fetchRecoveryRequest('0x' + 'r'.repeat(64)),
    ).rejects.toThrow('RecoveryRequest not found');
  });

  it('throws when data type is not moveObject', async () => {
    mockGetObject.mockResolvedValueOnce({
      data: { content: { dataType: 'package' } },
    });

    await expect(
      fetchRecoveryRequest('0x' + 'r'.repeat(64)),
    ).rejects.toThrow('RecoveryRequest not found');
  });
});

// ============================================
// findActiveRecoveryForAccount
// ============================================

describe('findActiveRecoveryForAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no events exist', async () => {
    mockQueryEvents.mockResolvedValueOnce({ data: [] });

    const result = await findActiveRecoveryForAccount(ADDR_A);
    expect(result).toBeNull();
  });

  it('returns null when all recovery requests are executed', async () => {
    const requestId = '0x' + 'r'.repeat(64);

    mockQueryEvents.mockResolvedValueOnce({
      data: [
        {
          parsedJson: {
            account_id: ADDR_A,
            request_id: requestId,
          },
        },
      ],
    });

    mockGetObject.mockResolvedValueOnce({
      data: {
        content: {
          dataType: 'moveObject',
          fields: {
            id: { id: requestId },
            account_id: ADDR_A,
            requester: ADDR_B,
            new_owner: ADDR_C,
            approvals: [],
            required_approvals: 2,
            timelock_end: '1700000000000',
            is_executed: true,
            is_cancelled: false,
            created_at: '1699000000000',
          },
        },
      },
    });

    const result = await findActiveRecoveryForAccount(ADDR_A);
    expect(result).toBeNull();
  });

  it('returns null for events from different accounts', async () => {
    const otherAccount = '0x' + 'f'.repeat(64);

    mockQueryEvents.mockResolvedValueOnce({
      data: [
        {
          parsedJson: {
            account_id: otherAccount,
            request_id: '0x' + 'r'.repeat(64),
          },
        },
      ],
    });

    const result = await findActiveRecoveryForAccount(ADDR_A);
    expect(result).toBeNull();
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('handles fetch failure gracefully', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [
        {
          parsedJson: {
            account_id: ADDR_A,
            request_id: '0x' + 'r'.repeat(64),
          },
        },
      ],
    });

    mockGetObject.mockRejectedValueOnce(new Error('Object deleted'));

    const result = await findActiveRecoveryForAccount(ADDR_A);
    expect(result).toBeNull();
  });

  it('skips events with missing request_id', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [
        {
          parsedJson: {
            account_id: ADDR_A,
            // request_id missing
          },
        },
      ],
    });

    const result = await findActiveRecoveryForAccount(ADDR_A);
    expect(result).toBeNull();
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('skips events with null parsedJson', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [{ parsedJson: null }],
    });

    const result = await findActiveRecoveryForAccount(ADDR_A);
    expect(result).toBeNull();
  });
});

// ============================================
// Recovery Flow State Machine (integration-style)
// ============================================

describe('recovery flow state machine', () => {
  it('progresses through complete recovery lifecycle', () => {
    const now = Date.now();

    // Step 1: Recovery initiated (fresh request)
    const step1 = makeRecoveryRequest({
      approvals: [],
      requiredApprovals: 2,
      timelockEnd: now + NSA_TIMELOCK_MS,
    });
    expect(computeRecoveryStatus(step1, now)).toBe('timelock_active');
    expect(canExecuteRecovery(step1, now)).toBe(false);
    expect(getRemainingApprovalsNeeded(step1)).toBe(2);

    // Step 2: First guardian approves
    const step2 = { ...step1, approvals: [ADDR_A] };
    expect(computeRecoveryStatus(step2, now)).toBe('timelock_active');
    expect(canExecuteRecovery(step2, now)).toBe(false);
    expect(getRemainingApprovalsNeeded(step2)).toBe(1);
    expect(hasApproved(step2, ADDR_A)).toBe(true);
    expect(hasApproved(step2, ADDR_B)).toBe(false);

    // Step 3: Second guardian approves (threshold met, timelock still active)
    const step3 = { ...step1, approvals: [ADDR_A, ADDR_B] };
    expect(computeRecoveryStatus(step3, now)).toBe('timelock_active');
    expect(canExecuteRecovery(step3, now)).toBe(false);
    expect(getRemainingApprovalsNeeded(step3)).toBe(0);

    // Step 4: Timelock expires (ready to execute)
    const afterTimelock = now + NSA_TIMELOCK_MS + 1;
    expect(computeRecoveryStatus(step3, afterTimelock)).toBe(
      'ready_to_execute',
    );
    expect(canExecuteRecovery(step3, afterTimelock)).toBe(true);

    // Step 5: Recovery executed
    const step5 = { ...step3, isExecuted: true };
    expect(computeRecoveryStatus(step5)).toBe('executed');
    expect(canExecuteRecovery(step5, afterTimelock)).toBe(false);
  });

  it('handles cancellation at any point', () => {
    const now = Date.now();

    // Even with full approvals and expired timelock, cancel is final
    const req = makeRecoveryRequest({
      approvals: [ADDR_A, ADDR_B],
      requiredApprovals: 2,
      timelockEnd: now - 1,
      isCancelled: true,
    });

    expect(computeRecoveryStatus(req)).toBe('cancelled');
    expect(canExecuteRecovery(req, now)).toBe(false);
  });

  it('account owner can cancel during timelock', () => {
    const req = makeRecoveryRequest({
      approvals: [ADDR_A],
      requiredApprovals: 2,
    });
    const account = makeAccountState();

    // Signer can cancel
    expect(canCancelRecovery(req, account, ADDR_SIGNER)).toBe(true);
    // Guardian cannot cancel
    expect(canCancelRecovery(req, account, ADDR_A)).toBe(false);
  });

  it('handles edge: approvals arrive after timelock expires', () => {
    const now = Date.now();

    // Timelock expired but no approvals
    const req = makeRecoveryRequest({
      timelockEnd: now - 100000,
      approvals: [],
      requiredApprovals: 2,
    });
    expect(computeRecoveryStatus(req, now)).toBe('pending_approvals');
    expect(canExecuteRecovery(req, now)).toBe(false);

    // One approval arrives
    const withOne = { ...req, approvals: [ADDR_A] };
    expect(computeRecoveryStatus(withOne, now)).toBe('pending_approvals');
    expect(canExecuteRecovery(withOne, now)).toBe(false);

    // Second approval arrives - now ready
    const withTwo = { ...req, approvals: [ADDR_A, ADDR_B] };
    expect(computeRecoveryStatus(withTwo, now)).toBe('ready_to_execute');
    expect(canExecuteRecovery(withTwo, now)).toBe(true);
  });
});
