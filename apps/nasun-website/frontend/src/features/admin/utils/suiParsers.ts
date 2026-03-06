import { SuiObjectData } from '@mysten/sui/client';
import type { ProposalSummary, VoterRecord } from '../types';

/**
 * Extract proposal IDs from Dashboard Sui object
 */
export function getDashboardProposalIds(data: SuiObjectData | null | undefined): string[] {
  if (!data || data.content?.dataType !== 'moveObject') return [];
  const fields = data.content.fields as { proposals_ids?: string[] };
  return fields.proposals_ids || [];
}

/**
 * Parse Sui Proposal object to ProposalSummary
 */
export function parseProposalSummary(data: SuiObjectData | null | undefined): ProposalSummary | null {
  if (!data || data.content?.dataType !== 'moveObject') return null;

  const fields = data.content.fields as {
    title: string;
    description: string;
    vote_count_yes?: number;
    vote_count_no?: number;
    total_power_yes?: number;
    total_power_no?: number;
    expiration: number;
    status: { variant: string };
    voters?: { fields: { id: { id: string } } };
    creator: string;
  };

  const expiration = Number(fields.expiration);
  const isExpired = new Date(expiration) < new Date();
  const isDelisted = fields.status?.variant === 'Delisted';

  return {
    id: data.objectId,
    title: fields.title,
    description: fields.description,
    yesVotes: fields.vote_count_yes || 0,
    noVotes: fields.vote_count_no || 0,
    yesPower: Number(fields.total_power_yes) || 0,
    noPower: Number(fields.total_power_no) || 0,
    expiration,
    isExpired,
    isDelisted,
    proposalType: 'Governance', // Overridden by useAdminProposals with registry lookup
    votersTableId: fields.voters?.fields?.id?.id || '',
    creator: fields.creator,
  };
}

/**
 * Parse Sui dynamic field to VoterRecord
 */
export function parseVoterRecord(
  name: { type: string; value: unknown },
  data: SuiObjectData | null | undefined
): VoterRecord | null {
  if (!data || data.content?.dataType !== 'moveObject') return null;

  // Dynamic field structure: fields.value.fields contains the VoteRecord
  const fields = data.content.fields as {
    value?: {
      fields?: {
        vote_yes?: boolean;
        voting_power?: string | number;
      };
    };
  };

  const voteRecord = fields.value?.fields;
  const voter = typeof name.value === 'string' ? name.value : String(name.value);

  return {
    voter,
    votedYes: voteRecord?.vote_yes ?? false,
    votingPower: Number(voteRecord?.voting_power) || 0,
  };
}
