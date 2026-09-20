// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SuiObjectData, SuiObjectResponse } from '@mysten/sui/client';
import {
  buildVoteHistoryEntry,
  extractVotedProposalIds,
  readVoteRecord,
  readVotersTableId,
  resolveProposalStatus,
} from '../voteHistoryParsers';
import { ProposalFields } from '../../types/voting';

// Shapes below mirror what the live devnet returns. Verified against
// sui_getNormalizedMoveStruct on the deployed governance package:
// VoteProofNFT is { id, proposal_id, name, description, url } with no vote
// direction and no voting power, and Proposal.voters is
// Table<address, VoteRecord{ vote_yes: bool, voting_power: u64 }>.

function voteProof(proposalId: string): SuiObjectResponse {
  return {
    data: {
      objectId: '0xnft',
      version: '1',
      digest: 'd',
      content: {
        dataType: 'moveObject',
        type: '0xpkg::proposal::VoteProofNFT',
        hasPublicTransfer: false,
        fields: {
          id: { id: '0xnft' },
          proposal_id: proposalId,
          name: 'Vote Proof',
          description: '',
          url: 'https://gateway.example/ipfs/whatever',
        },
      },
    },
  } as unknown as SuiObjectResponse;
}

/** An owned object whose content did not come back (pruned, or showContent off). */
function contentlessProof(): SuiObjectResponse {
  return {
    data: { objectId: '0xopaque', version: '1', digest: 'd' },
  } as unknown as SuiObjectResponse;
}

function voteRecordField(voteYes: boolean, power: string): SuiObjectData {
  return {
    objectId: '0xfield',
    version: '1',
    digest: 'd',
    content: {
      dataType: 'moveObject',
      type: '0x2::dynamic_field::Field<address, 0xpkg::proposal::VoteRecord>',
      hasPublicTransfer: false,
      fields: {
        id: { id: '0xfield' },
        name: '0xvoter',
        value: {
          type: '0xpkg::proposal::VoteRecord',
          fields: { vote_yes: voteYes, voting_power: power },
        },
      },
    },
  } as unknown as SuiObjectData;
}

function proposalObject(fields: Partial<ProposalFields>): SuiObjectData {
  return {
    objectId: '0xproposal',
    version: '1',
    digest: 'd',
    content: {
      dataType: 'moveObject',
      type: '0xpkg::proposal::Proposal',
      hasPublicTransfer: false,
      fields: {
        title: 'A proposal',
        description: '',
        total_power_yes: '0',
        total_power_no: '0',
        vote_count_yes: '0',
        vote_count_no: '0',
        expiration: '0',
        creator: '0xcreator',
        status: { variant: 'Active' },
        voters: { fields: { id: { id: '0xvoters' } } },
        ...fields,
      },
    },
  } as unknown as SuiObjectData;
}

describe('extractVotedProposalIds', () => {
  it('drops entries without move content instead of shifting the rest', () => {
    // The old hook filtered here but indexed the proposal results by the
    // unfiltered position, so one contentless NFT paired every later vote with
    // the previous proposal's title and status.
    const ids = extractVotedProposalIds([
      voteProof('0xaaa'),
      contentlessProof(),
      voteProof('0xbbb'),
      voteProof('0xccc'),
    ]);

    expect(ids).toEqual(['0xaaa', '0xbbb', '0xccc']);
  });

  it('returns an empty list for undefined input', () => {
    expect(extractVotedProposalIds(undefined)).toEqual([]);
  });
});

describe('readVoteRecord', () => {
  it('reads both direction and power from the on-chain record', () => {
    expect(readVoteRecord(voteRecordField(false, '7'))).toEqual({
      voteYes: false,
      votingPower: 7,
    });
    expect(readVoteRecord(voteRecordField(true, '1'))).toEqual({
      voteYes: true,
      votingPower: 1,
    });
  });

  it('preserves a No vote rather than defaulting it to Yes', () => {
    // This is the whole defect: the previous implementation guessed the
    // direction from the NFT image URL and returned Yes for anything it did
    // not recognise, so a real No showed in history as a Yes.
    expect(readVoteRecord(voteRecordField(false, '3'))?.voteYes).toBe(false);
  });

  it('returns null when the field is absent, not a Yes with power 1', () => {
    expect(readVoteRecord(null)).toBeNull();
    expect(readVoteRecord(undefined)).toBeNull();
  });

  it('returns null when the value carries no boolean direction', () => {
    const malformed = {
      objectId: '0xfield',
      version: '1',
      digest: 'd',
      content: {
        dataType: 'moveObject',
        type: '0x2::dynamic_field::Field<address, u64>',
        hasPublicTransfer: false,
        fields: { id: { id: '0xfield' }, name: '0xvoter', value: '42' },
      },
    } as unknown as SuiObjectData;

    expect(readVoteRecord(malformed)).toBeNull();
  });

  it('treats an unparseable power as zero, not as one', () => {
    const record = readVoteRecord(voteRecordField(true, 'not-a-number'));
    expect(record).toEqual({ voteYes: true, votingPower: 0 });
  });
});

describe('readVotersTableId', () => {
  it('finds the table id a vote record lookup needs', () => {
    expect(readVotersTableId(proposalObject({}))).toBe('0xvoters');
  });

  it('returns null for an object that did not parse', () => {
    expect(readVotersTableId(null)).toBeNull();
  });
});

describe('resolveProposalStatus', () => {
  const now = 1_000_000;

  it('reports Delisted regardless of expiry', () => {
    const fields = proposalObject({ status: { variant: 'Delisted' } })
      .content as unknown as { fields: ProposalFields };
    expect(resolveProposalStatus(fields.fields, now)).toBe('Delisted');
  });

  it('reports Active while the deadline is in the future', () => {
    const fields = proposalObject({ expiration: String(now + 1) })
      .content as unknown as { fields: ProposalFields };
    expect(resolveProposalStatus(fields.fields, now)).toBe('Active');
  });

  it('decides Passed or Failed by voting power once expired', () => {
    const passed = proposalObject({
      expiration: String(now - 1),
      total_power_yes: '10',
      total_power_no: '4',
    }).content as unknown as { fields: ProposalFields };
    expect(resolveProposalStatus(passed.fields, now)).toBe('Passed');

    const failed = proposalObject({
      expiration: String(now - 1),
      total_power_yes: '4',
      total_power_no: '10',
    }).content as unknown as { fields: ProposalFields };
    expect(resolveProposalStatus(failed.fields, now)).toBe('Failed');
  });

  it('treats a tie as Failed', () => {
    const tied = proposalObject({
      expiration: String(now - 1),
      total_power_yes: '5',
      total_power_no: '5',
    }).content as unknown as { fields: ProposalFields };
    expect(resolveProposalStatus(tied.fields, now)).toBe('Failed');
  });
});

describe('buildVoteHistoryEntry', () => {
  const now = 1_000_000;

  it('pairs the proposal with the voter record it was fetched for', () => {
    const entry = buildVoteHistoryEntry(
      '0xaaa',
      proposalObject({ title: 'Raise the cap', expiration: String(now + 1) }),
      { voteYes: false, votingPower: 12 },
      now
    );

    expect(entry).toEqual({
      proposalId: '0xaaa',
      proposalTitle: 'Raise the cap',
      voteYes: false,
      votingPower: 12,
      proposalStatus: 'Active',
    });
  });

  it('drops the row when the vote record could not be read', () => {
    expect(
      buildVoteHistoryEntry('0xaaa', proposalObject({}), null, now)
    ).toBeNull();
  });

  it('drops the row when the proposal could not be read', () => {
    expect(
      buildVoteHistoryEntry('0xaaa', null, { voteYes: true, votingPower: 1 }, now)
    ).toBeNull();
  });
});
