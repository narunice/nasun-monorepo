/**
 * Pure parsing helpers behind useVoteHistory.
 *
 * The vote direction and the power spent on it live on chain, in the
 * proposal's `voters: Table<address, VoteRecord>` (see
 * contracts/governance/sources/proposal.move). VoteProofNFT carries neither -
 * it has only id, proposal_id, name, description and url - so any answer
 * derived from the NFT alone is a guess. These helpers read the record.
 */

import { SuiObjectData, SuiObjectResponse } from "@mysten/sui/client";
import { ProposalFields, ProposalStatus, VoteHistory } from "../types/voting";

export interface VoteRecord {
  voteYes: boolean;
  votingPower: number;
}

/**
 * Proposal ids from a page of VoteProofNFT objects, in owner order.
 *
 * Entries whose content did not come back are dropped here and nowhere else.
 * Filtering in one place and indexing in another is what used to pair a vote
 * with the wrong proposal.
 */
export function extractVotedProposalIds(
  objects: SuiObjectResponse[] | undefined
): string[] {
  if (!objects) return [];

  return objects
    .map((object) => {
      if (object.data?.content?.dataType !== "moveObject") return null;
      const fields = object.data.content.fields as Record<string, unknown>;
      const proposalId = fields.proposal_id;
      return typeof proposalId === "string" ? proposalId : null;
    })
    .filter((id): id is string => id !== null);
}

/** The dynamic-field id of a proposal's voters table, if the object parsed. */
export function readVotersTableId(
  data: SuiObjectData | null | undefined
): string | null {
  if (data?.content?.dataType !== "moveObject") return null;
  const fields = data.content.fields as ProposalFields;
  return fields.voters?.fields?.id?.id || null;
}

/**
 * Decode one `Field<address, VoteRecord>` object.
 *
 * Returns null rather than defaulting: a record we cannot read is not a Yes,
 * and it is not a zero-power vote either.
 */
export function readVoteRecord(
  data: SuiObjectData | null | undefined
): VoteRecord | null {
  if (data?.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as {
    value?: { fields?: { vote_yes?: boolean; voting_power?: string | number } };
  };
  const record = fields.value?.fields;

  if (typeof record?.vote_yes !== "boolean") return null;

  const votingPower = Number(record.voting_power);

  return {
    voteYes: record.vote_yes,
    votingPower: Number.isFinite(votingPower) ? votingPower : 0,
  };
}

export function resolveProposalStatus(
  fields: ProposalFields,
  now: number
): VoteHistory["proposalStatus"] {
  const status = fields.status as ProposalStatus;
  if (status?.variant === "Delisted") return "Delisted";

  if (Number(fields.expiration) >= now) return "Active";

  const yesPower = Number(fields.total_power_yes) || 0;
  const noPower = Number(fields.total_power_no) || 0;
  return yesPower > noPower ? "Passed" : "Failed";
}

/**
 * Combine one proposal object with the voter's on-chain record.
 *
 * Both are required. Without the proposal there is no title or status, and
 * without the record there is no substantiated direction, so the entry is
 * dropped instead of being filled in with a plausible-looking default.
 */
export function buildVoteHistoryEntry(
  proposalId: string,
  proposalData: SuiObjectData | null | undefined,
  record: VoteRecord | null,
  now: number
): VoteHistory | null {
  if (proposalData?.content?.dataType !== "moveObject") return null;
  if (!record) return null;

  const fields = proposalData.content.fields as ProposalFields;

  return {
    proposalId,
    proposalTitle: fields.title,
    voteYes: record.voteYes,
    votingPower: record.votingPower,
    proposalStatus: resolveProposalStatus(fields, now),
  };
}
