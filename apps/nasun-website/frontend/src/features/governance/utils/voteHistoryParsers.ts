/**
 * Pure parsing helpers behind useVoteHistory.
 *
 * The vote direction and the power spent on it live on chain, in the
 * proposal's `voters` table (see contracts/governance/sources/proposal.move
 * and multi_choice_proposal.move). Neither proof NFT carries them - both have
 * only id, proposal_id, name, description and url - so any answer derived from
 * an NFT alone is a guess. These helpers read the record.
 */

import { SuiObjectData, SuiObjectResponse } from "@mysten/sui/client";
import {
  GovernanceStats,
  ProposalFields,
  ProposalStatus,
  VoteHistory,
} from "../types/voting";
import { MultiChoiceProposalFields } from "../types/multiChoice";
import { getChoiceLabel, isMultiChoiceProposal } from "./proposalHelpers";

export interface VoteRecord {
  voteYes: boolean;
  votingPower: number;
}

export interface MultiChoiceVoteRecord {
  selectedChoice: number;
  votingPower: number;
}

/** The node rejects a larger multiGetObjects batch with -32602. */
export const MULTI_GET_OBJECTS_LIMIT = 50;

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");

  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Proposal ids from a page of vote proof objects, in owner order.
 *
 * Both VoteProofNFT and MultiChoiceVoteProofNFT expose `proposal_id`, so one
 * reader covers them.
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

/**
 * The dashboard's registered proposal ids, or null when the object did not
 * parse. Null and an empty list mean different things: one is "we do not know
 * how many proposals exist", the other is "there are none".
 */
export function readDashboardProposalIds(
  data: SuiObjectData | null | undefined
): string[] | null {
  if (data?.content?.dataType !== "moveObject") return null;

  const ids = (data.content.fields as { proposals_ids?: unknown })
    .proposals_ids;
  if (!Array.isArray(ids)) return null;

  return ids.filter((id): id is string => typeof id === "string");
}

/** The proposals the public list shows (see GovernanceSection). */
export function selectVisibleProposalIds(
  registeredIds: string[],
  hiddenIds: Set<string>
): string[] {
  return registeredIds.filter((id) => !hiddenIds.has(id));
}

/**
 * Participation measured over one set instead of two.
 *
 * The denominator is what the public list shows, registered minus hidden. The
 * numerator is the subset of those the wallet voted on, counting both proposal
 * kinds; counting only binary proofs against every registered proposal is what
 * reported 0% for someone who had voted, and what a clamp at 100% was hiding.
 * Being an intersection, the numerator cannot exceed the denominator, so no
 * clamp is needed.
 *
 * Returns null when any input is unknown. A rate computed off a denominator we
 * could not verify, or off a numerator counted from an incomplete proof list,
 * is worse than showing none: "Voted: 0/6" reads as a fact.
 */
export function computeParticipation(
  registeredIds: string[] | null,
  hiddenIds: Set<string> | null,
  votedProposalIds: Set<string> | null
): GovernanceStats | null {
  if (!registeredIds || !hiddenIds || !votedProposalIds) return null;

  const visible = selectVisibleProposalIds(registeredIds, hiddenIds);
  const voted = visible.filter((id) => votedProposalIds.has(id));

  return {
    totalProposals: visible.length,
    votedProposals: voted.length,
    participationRate:
      visible.length > 0 ? (voted.length / visible.length) * 100 : 0,
  };
}

/**
 * The wallet's voted proposals that the list still carries, newest first.
 *
 * Registration order is the only ordering available: neither vote record nor
 * proof NFT carries a timestamp, so the exact vote time is not on chain. It
 * holds in one direction - a vote cannot be cast before its proposal exists -
 * which the expiration date does not, since a long-lived old proposal outranks
 * a short recent one under that key. Owner order, which this replaces, carries
 * no time information at all.
 *
 * Ids the list does not carry are dropped: hidden and unregistered proposals,
 * and the pre-reset ids that admin_restore_vote_proof stamps onto restored
 * proofs, which resolve to nothing on this chain.
 */
export function orderVotedProposalIds(
  votedProposalIds: Set<string>,
  listedIds: string[]
): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (let i = listedIds.length - 1; i >= 0; i--) {
    const id = listedIds[i];
    if (!votedProposalIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  return ordered;
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

/** Decode one `Field<address, MultiChoiceVoteRecord>` object. */
export function readMultiChoiceVoteRecord(
  data: SuiObjectData | null | undefined
): MultiChoiceVoteRecord | null {
  if (data?.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as {
    value?: {
      fields?: {
        selected_choice?: string | number;
        voting_power?: string | number;
      };
    };
  };
  const record = fields.value?.fields;
  const rawChoice = record?.selected_choice;

  // Type-checked rather than compared against undefined: Number(null) is 0, so
  // an absent choice would otherwise be reported as a vote for the first
  // option. The binary reader beside this one guards the same way.
  if (typeof rawChoice !== "string" && typeof rawChoice !== "number") {
    return null;
  }

  const selectedChoice = Number(rawChoice);
  if (!Number.isInteger(selectedChoice) || selectedChoice < 0) return null;

  const votingPower = Number(record?.voting_power);

  return {
    selectedChoice,
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
 * Outcome of an expired multi-choice proposal.
 *
 * MultiChoiceProposal has no total_power_yes / total_power_no, so the binary
 * rule reads both as 0 and calls every expired multi-choice proposal Failed.
 * This is the rule the proposal card itself applies: any power cast on any
 * choice means the vote produced a result.
 */
export function resolveMultiChoiceStatus(
  fields: MultiChoiceProposalFields,
  now: number
): VoteHistory["proposalStatus"] {
  if (fields.status?.variant === "Delisted") return "Delisted";

  if (Number(fields.expiration) >= now) return "Active";

  const powers = (fields.choice_powers || []).map(Number);
  const maxPower = powers.length > 0 ? Math.max(...powers) : 0;
  return maxPower > 0 ? "Passed" : "Failed";
}

/**
 * Combine one proposal object with the voter's on-chain record.
 *
 * The proposal's own type decides how the record is read, rather than which
 * proof NFT the id came from: a restored proof can name a proposal of either
 * kind, and reading a multi-choice record as a binary one yields no direction
 * at all.
 *
 * Both halves are required. Without the proposal there is no title or status,
 * and without the record there is no substantiated direction or choice, so the
 * entry is dropped instead of being filled in with a plausible-looking default.
 */
export function buildVoteHistoryEntry(
  proposalId: string,
  proposalData: SuiObjectData | null | undefined,
  recordData: SuiObjectData | null | undefined,
  now: number
): VoteHistory | null {
  if (proposalData?.content?.dataType !== "moveObject") return null;

  if (isMultiChoiceProposal(proposalData.content.type)) {
    const fields = proposalData.content.fields as MultiChoiceProposalFields;
    const record = readMultiChoiceVoteRecord(recordData);
    if (!record) return null;

    // A choice index the proposal has no label for means record and proposal
    // disagree. Rendering "choice 3" would be inventing the label.
    const choice = fields.choices?.[record.selectedChoice];
    if (typeof choice !== "string") return null;

    return {
      kind: "multiChoice",
      proposalId,
      proposalTitle: fields.title,
      choiceLabel: getChoiceLabel(choice),
      votingPower: record.votingPower,
      proposalStatus: resolveMultiChoiceStatus(fields, now),
    };
  }

  const fields = proposalData.content.fields as ProposalFields;
  const record = readVoteRecord(recordData);
  if (!record) return null;

  return {
    kind: "binary",
    proposalId,
    proposalTitle: fields.title,
    voteYes: record.voteYes,
    votingPower: record.votingPower,
    proposalStatus: resolveProposalStatus(fields, now),
  };
}
