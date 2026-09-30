// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SuiObjectData, SuiObjectResponse } from '@mysten/sui/client';
import {
  buildVoteHistoryEntry,
  chunk,
  computeParticipation,
  extractVotedProposalIds,
  MULTI_GET_OBJECTS_LIMIT,
  orderVotedProposalIds,
  readDashboardProposalIds,
  readMultiChoiceVoteRecord,
  readVoteRecord,
  readVotersTableId,
  resolveMultiChoiceStatus,
  resolveProposalStatus,
  selectVisibleProposalIds,
} from '../voteHistoryParsers';
import { ProposalFields } from '../../types/voting';
import { MultiChoiceProposalFields } from '../../types/multiChoice';

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

function multiChoiceVoteRecordField(
  selectedChoice: string,
  power: string
): SuiObjectData {
  return {
    objectId: '0xfield',
    version: '1',
    digest: 'd',
    content: {
      dataType: 'moveObject',
      type: '0x2::dynamic_field::Field<address, 0xpkg::multi_choice_proposal::MultiChoiceVoteRecord>',
      hasPublicTransfer: false,
      fields: {
        id: { id: '0xfield' },
        name: '0xvoter',
        value: {
          type: '0xpkg::multi_choice_proposal::MultiChoiceVoteRecord',
          fields: { selected_choice: selectedChoice, voting_power: power },
        },
      },
    },
  } as unknown as SuiObjectData;
}

function multiChoiceProposalObject(
  fields: Partial<MultiChoiceProposalFields>
): SuiObjectData {
  return {
    objectId: '0xmc',
    version: '1',
    digest: 'd',
    content: {
      dataType: 'moveObject',
      type: '0xpkg::multi_choice_proposal::MultiChoiceProposal',
      hasPublicTransfer: false,
      fields: {
        title: 'Pick one',
        description: '',
        choices: ['Option A', 'Option B'],
        choice_powers: ['0', '0'],
        choice_counts: ['0', '0'],
        use_equal_weight: false,
        expiration: '0',
        creator: '0xcreator',
        status: { variant: 'Active' },
        voters: { fields: { id: { id: '0xmcvoters' } } },
        ...fields,
      },
    },
  } as unknown as SuiObjectData;
}

function dashboardObject(proposalIds: unknown): SuiObjectData {
  return {
    objectId: '0xdashboard',
    version: '1',
    digest: 'd',
    content: {
      dataType: 'moveObject',
      type: '0xpkg::dashboard::Dashboard',
      hasPublicTransfer: false,
      fields: { id: { id: '0xdashboard' }, proposals_ids: proposalIds },
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
      voteRecordField(false, '12'),
      now
    );

    expect(entry).toEqual({
      kind: 'binary',
      proposalId: '0xaaa',
      proposalTitle: 'Raise the cap',
      voteYes: false,
      votingPower: 12,
      proposalStatus: 'Active',
    });
  });

  it('reports the chosen option for a multi-choice vote', () => {
    // The old hook queried only proposal::VoteProofNFT, so a multi-choice vote
    // produced no row at all.
    const entry = buildVoteHistoryEntry(
      '0xmc1',
      multiChoiceProposalObject({
        title: 'Pick a mascot',
        choices: ['Otter', 'Heron', 'Ibex'],
        expiration: String(now + 1),
      }),
      multiChoiceVoteRecordField('2', '30'),
      now
    );

    expect(entry).toEqual({
      kind: 'multiChoice',
      proposalId: '0xmc1',
      proposalTitle: 'Pick a mascot',
      choiceLabel: 'Ibex',
      votingPower: 30,
      proposalStatus: 'Active',
    });
  });

  it('reads a tweet choice as its handle rather than a URL', () => {
    const entry = buildVoteHistoryEntry(
      '0xmc1',
      multiChoiceProposalObject({
        choices: ['https://x.com/someone/status/123'],
        expiration: String(now + 1),
      }),
      multiChoiceVoteRecordField('0', '10'),
      now
    );

    expect(entry).toMatchObject({ choiceLabel: '@someone' });
  });

  it('decides the kind from the proposal, not from which proof was held', () => {
    // A restored proof can name a proposal of either kind. Reading a
    // multi-choice record as a binary one yields no direction at all, so the
    // proposal's own type has to drive the parse.
    const asBinary = buildVoteHistoryEntry(
      '0xmc1',
      multiChoiceProposalObject({ expiration: String(now + 1) }),
      voteRecordField(true, '5'),
      now
    );
    expect(asBinary).toBeNull();

    const asMultiChoice = buildVoteHistoryEntry(
      '0xaaa',
      proposalObject({ expiration: String(now + 1) }),
      multiChoiceVoteRecordField('0', '5'),
      now
    );
    expect(asMultiChoice).toBeNull();
  });

  it('drops the row when the choice index has no label', () => {
    expect(
      buildVoteHistoryEntry(
        '0xmc1',
        multiChoiceProposalObject({ choices: ['Only one'] }),
        multiChoiceVoteRecordField('4', '5'),
        now
      )
    ).toBeNull();
  });

  it('drops the row when the vote record could not be read', () => {
    expect(
      buildVoteHistoryEntry('0xaaa', proposalObject({}), null, now)
    ).toBeNull();
  });

  it('drops the row when the proposal could not be read', () => {
    expect(
      buildVoteHistoryEntry('0xaaa', null, voteRecordField(true, '1'), now)
    ).toBeNull();
  });
});

describe('readMultiChoiceVoteRecord', () => {
  it('reads the chosen index and the power spent', () => {
    expect(readMultiChoiceVoteRecord(multiChoiceVoteRecordField('1', '25'))).toEqual({
      selectedChoice: 1,
      votingPower: 25,
    });
  });

  it('keeps choice 0 distinct from a missing record', () => {
    expect(
      readMultiChoiceVoteRecord(multiChoiceVoteRecordField('0', '3'))
    ).toEqual({ selectedChoice: 0, votingPower: 3 });
    expect(readMultiChoiceVoteRecord(null)).toBeNull();
  });

  it('rejects a null choice instead of reading it as the first option', () => {
    // Number(null) is 0, so an absent choice would otherwise be reported as a
    // vote for choices[0].
    expect(
      readMultiChoiceVoteRecord(
        multiChoiceVoteRecordField(null as unknown as string, '3')
      )
    ).toBeNull();
  });

  it('rejects a choice index that is not a whole number', () => {
    expect(readMultiChoiceVoteRecord(multiChoiceVoteRecordField('x', '3'))).toBeNull();
    expect(readMultiChoiceVoteRecord(multiChoiceVoteRecordField('-1', '3'))).toBeNull();
  });

  it('returns null for a binary record instead of reading choice 0', () => {
    expect(readMultiChoiceVoteRecord(voteRecordField(true, '9'))).toBeNull();
  });
});

describe('resolveMultiChoiceStatus', () => {
  const now = 1_000_000;

  function fieldsOf(overrides: Partial<MultiChoiceProposalFields>) {
    return (
      multiChoiceProposalObject(overrides).content as unknown as {
        fields: MultiChoiceProposalFields;
      }
    ).fields;
  }

  it('calls an expired multi-choice proposal with votes Passed', () => {
    // MultiChoiceProposal has no total_power_yes / total_power_no, so the binary
    // rule read both as 0 and reported Failed for every expired one.
    expect(
      resolveMultiChoiceStatus(
        fieldsOf({ expiration: String(now - 1), choice_powers: ['40', '12'] }),
        now
      )
    ).toBe('Passed');
  });

  it('calls an expired multi-choice proposal with no votes Failed', () => {
    expect(
      resolveMultiChoiceStatus(
        fieldsOf({ expiration: String(now - 1), choice_powers: ['0', '0'] }),
        now
      )
    ).toBe('Failed');
  });

  it('handles a proposal with no choice powers at all', () => {
    // Math.max() of an empty list is -Infinity, which must not read as Passed.
    expect(
      resolveMultiChoiceStatus(
        fieldsOf({ expiration: String(now - 1), choice_powers: [] }),
        now
      )
    ).toBe('Failed');
  });

  it('reports Active before the deadline and Delisted regardless', () => {
    expect(
      resolveMultiChoiceStatus(fieldsOf({ expiration: String(now + 1) }), now)
    ).toBe('Active');
    expect(
      resolveMultiChoiceStatus(
        fieldsOf({ expiration: String(now + 1), status: { variant: 'Delisted' } }),
        now
      )
    ).toBe('Delisted');
  });
});

describe('readDashboardProposalIds', () => {
  it('reads the registered ids in registration order', () => {
    expect(readDashboardProposalIds(dashboardObject(['0xp1', '0xp2']))).toEqual([
      '0xp1',
      '0xp2',
    ]);
  });

  it('distinguishes "no proposals" from "could not read"', () => {
    expect(readDashboardProposalIds(dashboardObject([]))).toEqual([]);
    expect(readDashboardProposalIds(null)).toBeNull();
    expect(readDashboardProposalIds(dashboardObject(undefined))).toBeNull();
  });
});

describe('computeParticipation', () => {
  const registered = ['0xp1', '0xp2', '0xp3', '0xp4', '0xmc1', '0xhidden1'];
  const hidden = new Set(['0xhidden1']);

  it('counts a multi-choice vote instead of reporting zero', () => {
    // Voting only on a multi-choice proposal used to read as 0%, because the
    // numerator counted binary proofs alone.
    expect(
      computeParticipation(registered, hidden, new Set(['0xmc1']))
    ).toEqual({
      totalProposals: 5,
      votedProposals: 1,
      participationRate: 20,
    });
  });

  it('reaches 100% when every listed proposal was voted on', () => {
    const voted = new Set(['0xp1', '0xp2', '0xp3', '0xp4', '0xmc1']);
    expect(computeParticipation(registered, hidden, voted)).toEqual({
      totalProposals: 5,
      votedProposals: 5,
      participationRate: 100,
    });
  });

  it('never exceeds 100%, so no clamp is hiding a mismatch', () => {
    // Proofs can name proposals the list does not carry: hidden ones,
    // unregistered ones, and pre-reset ids on restored proofs.
    const voted = new Set([
      '0xp1',
      '0xp2',
      '0xp3',
      '0xp4',
      '0xmc1',
      '0xhidden1',
      '0xgone',
    ]);
    expect(computeParticipation(registered, hidden, voted)).toMatchObject({
      votedProposals: 5,
      participationRate: 100,
    });
  });

  it('withholds the rate when any of the three sets is unknown', () => {
    expect(computeParticipation(null, hidden, new Set(['0xp1']))).toBeNull();
    expect(computeParticipation(registered, null, new Set(['0xp1']))).toBeNull();
    // A numerator counted from a proof list that failed to load would render as
    // a confident "Voted: 0/5 (0%)".
    expect(computeParticipation(registered, hidden, null)).toBeNull();
  });

  it('reports 0% rather than dividing by zero for an empty list', () => {
    expect(computeParticipation([], new Set(), new Set())).toEqual({
      totalProposals: 0,
      votedProposals: 0,
      participationRate: 0,
    });
  });
});

describe('selectVisibleProposalIds', () => {
  it('drops hidden ids and keeps registration order', () => {
    expect(
      selectVisibleProposalIds(['0xa', '0xb', '0xc'], new Set(['0xb']))
    ).toEqual(['0xa', '0xc']);
  });
});

describe('orderVotedProposalIds', () => {
  const listed = ['0xp1', '0xp2', '0xp3', '0xp4', '0xmc1'];

  it('returns the newest registered proposal first', () => {
    // Owner order, which this replaces, carries no time information: it used to
    // show an arbitrary three votes and hide the newest one for good.
    const voted = new Set(['0xp2', '0xp1', '0xp4', '0xp3', '0xmc1']);
    expect(orderVotedProposalIds(voted, listed)).toEqual([
      '0xmc1',
      '0xp4',
      '0xp3',
      '0xp2',
      '0xp1',
    ]);
  });

  it('drops votes on proposals the list does not carry', () => {
    const voted = new Set(['0xp2', '0xhidden1', '0xpre-reset']);
    expect(orderVotedProposalIds(voted, listed)).toEqual(['0xp2']);
  });

  it('returns each proposal once even if the list repeats it', () => {
    expect(orderVotedProposalIds(new Set(['0xp1']), ['0xp1', '0xp1'])).toEqual([
      '0xp1',
    ]);
  });

  it('returns nothing when the wallet has not voted', () => {
    expect(orderVotedProposalIds(new Set(), listed)).toEqual([]);
  });
});

describe('chunk', () => {
  it('splits ids into batches the node will accept', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `0x${i}`);
    const batches = chunk(ids, MULTI_GET_OBJECTS_LIMIT);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(50);
    expect(batches[1]).toEqual(['0x50']);
    expect(batches.flat()).toEqual(ids);
  });

  it('produces no batch for an empty list', () => {
    expect(chunk([], MULTI_GET_OBJECTS_LIMIT)).toEqual([]);
  });

  it('rejects a size that would never terminate', () => {
    expect(() => chunk(['0x1'], 0)).toThrow();
  });
});
