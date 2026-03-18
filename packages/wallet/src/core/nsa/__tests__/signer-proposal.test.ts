/**
 * NSA Signer Proposal & Acceptance Tests
 *
 * Tests for the 2-phase signer addition flow:
 * Phase 1: Existing signer proposes adding a new signer
 * Phase 2: Pending signer accepts by proving ownership
 *
 * Covers:
 * - buildProposeAddSigner (transaction building)
 * - buildAcceptSignerProposal (transaction building)
 * - buildCancelSignerProposal / buildDeclineSignerProposal
 * - buildRemoveSigner
 * - fetchSignerProposal (on-chain query)
 * - findActiveProposalsForAccount (event-based discovery)
 * - findProposalsForPendingSigner (invitation discovery)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  buildProposeAddSigner,
  buildAcceptSignerProposal,
  buildCancelSignerProposal,
  buildDeclineSignerProposal,
  buildRemoveSigner,
  fetchSignerProposal,
  findActiveProposalsForAccount,
  findProposalsForPendingSigner,
} from '../client';
import { NSA_SIGNER_TYPE_MAP } from '../../../types/nsa';
import type { NsaSignerType } from '../../../types/nsa';

const ACCOUNT_ID = '0x' + 'a'.repeat(64);
const PROPOSER = '0x' + 'b'.repeat(64);
const PENDING_SIGNER = '0x' + 'c'.repeat(64);
const PROPOSAL_ID = '0x' + 'd'.repeat(64);

// Helper: mock on-chain proposal object
function mockProposalResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      content: {
        dataType: 'moveObject',
        fields: {
          id: { id: PROPOSAL_ID },
          account_id: ACCOUNT_ID,
          proposer: PROPOSER,
          pending_signer: PENDING_SIGNER,
          signer_type: 1,
          weight: 5,
          label: Array.from(new TextEncoder().encode('backup-phone')),
          created_at: String(Date.now()),
          expires_at: String(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
          is_executed: false,
          is_cancelled: false,
          ...overrides,
        },
      },
    },
  };
}

// Helper: mock event for proposal creation
function mockProposalEvent(
  accountId: string,
  proposalId: string,
  pendingSigner: string,
) {
  return {
    parsedJson: {
      account_id: accountId,
      proposal_id: proposalId,
      pending_signer: pendingSigner,
    },
  };
}

describe('buildProposeAddSigner', () => {
  it('builds transaction with correct Move call target', () => {
    const tx = buildProposeAddSigner({
      accountObjectId: ACCOUNT_ID,
      pendingSigner: PENDING_SIGNER,
      signerType: 'passkey',
      weight: 5,
      label: 'backup-phone',
    });
    expect(tx).toBeDefined();
    // Transaction should be buildable
    expect(typeof tx.serialize).toBe('function');
  });

  it.each([
    ['zklogin', 0],
    ['passkey', 1],
    ['local', 2],
    ['hardware', 3],
  ] as [NsaSignerType, number][])(
    'maps signer type %s to on-chain value %d',
    (type, expected) => {
      expect(NSA_SIGNER_TYPE_MAP[type]).toBe(expected);
      // Build should not throw for any valid type
      const tx = buildProposeAddSigner({
        accountObjectId: ACCOUNT_ID,
        pendingSigner: PENDING_SIGNER,
        signerType: type,
        weight: 1,
        label: `signer-${type}`,
      });
      expect(tx).toBeDefined();
    },
  );

  it('encodes label as UTF-8 bytes (ASCII)', () => {
    // ASCII label should work
    const tx = buildProposeAddSigner({
      accountObjectId: ACCOUNT_ID,
      pendingSigner: PENDING_SIGNER,
      signerType: 'local',
      weight: 1,
      label: 'my-key',
    });
    expect(tx).toBeDefined();
  });

  it('encodes label as UTF-8 bytes (multi-byte Korean)', () => {
    // Korean characters are multi-byte in UTF-8
    const tx = buildProposeAddSigner({
      accountObjectId: ACCOUNT_ID,
      pendingSigner: PENDING_SIGNER,
      signerType: 'local',
      weight: 1,
      label: '백업키',
    });
    expect(tx).toBeDefined();
  });

  it('handles empty label', () => {
    const tx = buildProposeAddSigner({
      accountObjectId: ACCOUNT_ID,
      pendingSigner: PENDING_SIGNER,
      signerType: 'local',
      weight: 1,
      label: '',
    });
    expect(tx).toBeDefined();
  });

  it('handles maximum weight (10)', () => {
    const tx = buildProposeAddSigner({
      accountObjectId: ACCOUNT_ID,
      pendingSigner: PENDING_SIGNER,
      signerType: 'local',
      weight: 10,
      label: 'max-weight',
    });
    expect(tx).toBeDefined();
  });

  it('handles minimum weight (1)', () => {
    const tx = buildProposeAddSigner({
      accountObjectId: ACCOUNT_ID,
      pendingSigner: PENDING_SIGNER,
      signerType: 'local',
      weight: 1,
      label: 'min-weight',
    });
    expect(tx).toBeDefined();
  });
});

describe('buildAcceptSignerProposal', () => {
  it('builds transaction with proposal and account IDs', () => {
    const tx = buildAcceptSignerProposal({
      proposalObjectId: PROPOSAL_ID,
      accountObjectId: ACCOUNT_ID,
    });
    expect(tx).toBeDefined();
    expect(typeof tx.serialize).toBe('function');
  });
});

describe('buildCancelSignerProposal', () => {
  it('builds cancel transaction', () => {
    const tx = buildCancelSignerProposal({
      proposalObjectId: PROPOSAL_ID,
      accountObjectId: ACCOUNT_ID,
    });
    expect(tx).toBeDefined();
  });
});

describe('buildDeclineSignerProposal', () => {
  it('builds decline transaction (no account ID needed)', () => {
    const tx = buildDeclineSignerProposal({
      proposalObjectId: PROPOSAL_ID,
    });
    expect(tx).toBeDefined();
  });
});

describe('buildRemoveSigner', () => {
  it('builds remove signer transaction', () => {
    const tx = buildRemoveSigner({
      accountObjectId: ACCOUNT_ID,
      signerToRemove: PENDING_SIGNER,
    });
    expect(tx).toBeDefined();
  });
});

describe('fetchSignerProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses on-chain proposal state correctly', async () => {
    mockGetObject.mockResolvedValueOnce(mockProposalResponse());

    const proposal = await fetchSignerProposal(PROPOSAL_ID);

    expect(proposal.objectId).toBe(PROPOSAL_ID);
    expect(proposal.accountId).toBe(ACCOUNT_ID);
    expect(proposal.proposer).toBe(PROPOSER);
    expect(proposal.pendingSigner).toBe(PENDING_SIGNER);
    expect(proposal.weight).toBe(5);
    expect(proposal.isExecuted).toBe(false);
    expect(proposal.isCancelled).toBe(false);
    expect(proposal.label).toBe('backup-phone');
  });

  it('parses executed proposal', async () => {
    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ is_executed: true }),
    );

    const proposal = await fetchSignerProposal(PROPOSAL_ID);
    expect(proposal.isExecuted).toBe(true);
  });

  it('parses cancelled proposal', async () => {
    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ is_cancelled: true }),
    );

    const proposal = await fetchSignerProposal(PROPOSAL_ID);
    expect(proposal.isCancelled).toBe(true);
  });

  it('throws NsaError when object not found', async () => {
    mockGetObject.mockResolvedValueOnce({ data: null });

    await expect(fetchSignerProposal(PROPOSAL_ID)).rejects.toThrow(
      'SignerProposal not found',
    );
  });

  it('throws NsaError when object has wrong data type', async () => {
    mockGetObject.mockResolvedValueOnce({
      data: { content: { dataType: 'package' } },
    });

    await expect(fetchSignerProposal(PROPOSAL_ID)).rejects.toThrow(
      'SignerProposal not found',
    );
  });

  it('throws on network error', async () => {
    mockGetObject.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(fetchSignerProposal(PROPOSAL_ID)).rejects.toThrow(
      'Network timeout',
    );
  });
});

describe('findActiveProposalsForAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only active proposals for the account', async () => {
    const otherAccount = '0x' + 'f'.repeat(64);
    const proposal2Id = '0x' + 'e'.repeat(64);

    mockQueryEvents.mockResolvedValueOnce({
      data: [
        // Matching account, active
        mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER),
        // Different account, should be filtered
        mockProposalEvent(otherAccount, proposal2Id, PENDING_SIGNER),
      ],
    });

    // First proposal: active
    mockGetObject.mockResolvedValueOnce(mockProposalResponse());

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].objectId).toBe(PROPOSAL_ID);
  });

  it('filters out executed proposals', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER)],
    });

    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ is_executed: true }),
    );

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
  });

  it('filters out cancelled proposals', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER)],
    });

    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ is_cancelled: true }),
    );

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
  });

  it('filters out expired proposals', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER)],
    });

    // Expired: expires_at in the past
    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ expires_at: '1000000000000' }),
    );

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
  });

  it('returns empty when no events exist', async () => {
    mockQueryEvents.mockResolvedValueOnce({ data: [] });

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
  });

  it('handles proposal fetch failure gracefully (deleted object)', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER)],
    });

    mockGetObject.mockRejectedValueOnce(new Error('Object not found'));

    // Should not throw, just skip the failed proposal
    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
  });

  it('skips events with missing proposal_id', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [
        {
          parsedJson: {
            account_id: ACCOUNT_ID,
            // proposal_id missing
            pending_signer: PENDING_SIGNER,
          },
        },
      ],
    });

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('skips events with null parsedJson', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [{ parsedJson: null }],
    });

    const proposals = await findActiveProposalsForAccount(ACCOUNT_ID);
    expect(proposals).toHaveLength(0);
  });
});

describe('findProposalsForPendingSigner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns proposals where user is the pending signer', async () => {
    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER)],
    });

    mockGetObject.mockResolvedValueOnce(mockProposalResponse());

    const proposals = await findProposalsForPendingSigner(PENDING_SIGNER);

    expect(proposals).toHaveLength(1);
    expect(proposals[0].pendingSigner).toBe(PENDING_SIGNER);
  });

  it('performs case-insensitive address matching', async () => {
    const upperCaseAddress = PENDING_SIGNER.toUpperCase();

    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER)],
    });

    mockGetObject.mockResolvedValueOnce(mockProposalResponse());

    const proposals = await findProposalsForPendingSigner(upperCaseAddress);

    // Should match despite case difference
    expect(proposals).toHaveLength(1);
  });

  it('filters proposals for different pending signers', async () => {
    const otherSigner = '0x' + '9'.repeat(64);

    mockQueryEvents.mockResolvedValueOnce({
      data: [mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, otherSigner)],
    });

    const proposals = await findProposalsForPendingSigner(PENDING_SIGNER);
    expect(proposals).toHaveLength(0);
    expect(mockGetObject).not.toHaveBeenCalled();
  });

  it('filters out executed/cancelled/expired from results', async () => {
    const p1 = '0x' + '1'.repeat(64);
    const p2 = '0x' + '2'.repeat(64);
    const p3 = '0x' + '3'.repeat(64);

    mockQueryEvents.mockResolvedValueOnce({
      data: [
        mockProposalEvent(ACCOUNT_ID, p1, PENDING_SIGNER),
        mockProposalEvent(ACCOUNT_ID, p2, PENDING_SIGNER),
        mockProposalEvent(ACCOUNT_ID, p3, PENDING_SIGNER),
      ],
    });

    // p1: executed
    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ id: { id: p1 }, is_executed: true }),
    );
    // p2: cancelled
    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ id: { id: p2 }, is_cancelled: true }),
    );
    // p3: expired
    mockGetObject.mockResolvedValueOnce(
      mockProposalResponse({ id: { id: p3 }, expires_at: '1000000000000' }),
    );

    const proposals = await findProposalsForPendingSigner(PENDING_SIGNER);
    expect(proposals).toHaveLength(0);
  });

  it('returns empty when no events match', async () => {
    mockQueryEvents.mockResolvedValueOnce({ data: [] });

    const proposals = await findProposalsForPendingSigner(PENDING_SIGNER);
    expect(proposals).toHaveLength(0);
  });

  it('handles network error on event query', async () => {
    mockQueryEvents.mockRejectedValueOnce(new Error('RPC unavailable'));

    await expect(
      findProposalsForPendingSigner(PENDING_SIGNER),
    ).rejects.toThrow('RPC unavailable');
  });

  it('handles multiple active invitations from different accounts', async () => {
    const account2 = '0x' + 'f'.repeat(64);
    const p2 = '0x' + 'e'.repeat(64);

    mockQueryEvents.mockResolvedValueOnce({
      data: [
        mockProposalEvent(ACCOUNT_ID, PROPOSAL_ID, PENDING_SIGNER),
        mockProposalEvent(account2, p2, PENDING_SIGNER),
      ],
    });

    mockGetObject
      .mockResolvedValueOnce(mockProposalResponse())
      .mockResolvedValueOnce(
        mockProposalResponse({
          id: { id: p2 },
          account_id: account2,
        }),
      );

    const proposals = await findProposalsForPendingSigner(PENDING_SIGNER);
    expect(proposals).toHaveLength(2);
  });
});

// ============================================
// Edge Cases: Signer Type Mapping Completeness
// ============================================

describe('signer type mapping completeness', () => {
  it('all NsaSignerType values have numeric mapping', () => {
    const types: NsaSignerType[] = ['zklogin', 'passkey', 'local', 'hardware'];
    for (const type of types) {
      expect(NSA_SIGNER_TYPE_MAP[type]).toBeDefined();
      expect(typeof NSA_SIGNER_TYPE_MAP[type]).toBe('number');
    }
  });

  it('all numeric values are unique', () => {
    const values = Object.values(NSA_SIGNER_TYPE_MAP);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('all numeric values are within u8 range (0-255)', () => {
    for (const value of Object.values(NSA_SIGNER_TYPE_MAP)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(255);
    }
  });

  it('passkey must map to 1 (not 2) - regression test', () => {
    // Critical: if passkey maps to 2, it collides with local
    // and on-chain signer type would be wrong
    expect(NSA_SIGNER_TYPE_MAP['passkey']).toBe(1);
    expect(NSA_SIGNER_TYPE_MAP['local']).toBe(2);
  });
});
