// Governance types

export type SuiID = {
  id: string;
};

// Proposal type determines voting rules and gas payment
// - Governance: User pays gas, binding decision for protocol changes
// - Poll: Sponsored (zero gas), non-binding community sentiment
export type ProposalType = "Governance" | "Poll";

// Vote history for My Account page
interface VoteHistoryBase {
  proposalId: string;
  proposalTitle: string;
  // Read from the proposal's on-chain vote record, never inferred from the vote
  // proof NFT, which carries neither direction nor power.
  votingPower: number;
  proposalStatus: "Active" | "Passed" | "Failed" | "Delisted";
}

// A binary Yes/No vote, recorded as proposal::VoteRecord.
export interface BinaryVoteHistory extends VoteHistoryBase {
  kind: "binary";
  voteYes: boolean;
}

// A single-select vote, recorded as multi_choice_proposal::MultiChoiceVoteRecord,
// which stores a choice index and no direction. The two kinds are separate
// because there is no Yes/No to report for a multi-choice vote.
export interface MultiChoiceVoteHistory extends VoteHistoryBase {
  kind: "multiChoice";
  // Label of the chosen option, resolved through getChoiceLabel so a tweet
  // choice reads as @handle rather than a URL.
  choiceLabel: string;
}

export type VoteHistory = BinaryVoteHistory | MultiChoiceVoteHistory;

// Governance participation statistics
export interface GovernanceStats {
  totalProposals: number;
  votedProposals: number;
  participationRate: number;
}

export type ProposalStatus = {
  variant: "Active" | "Delisted";
};

export interface Proposal {
  id: SuiID;
  title: string;
  description: string;
  status: ProposalStatus;
  proposalType: ProposalType;
  yesVotes: string;
  noVotes: string;
  yesCount: number;
  noCount: number;
  expiration: number;
  creator: string;
  voters: string; // Table ID
}

export interface VoteNft {
  id: SuiID;
  proposalId: string;
  url: string;
}

// Certificate from Oracle API (used by both sponsored and direct vote)
export interface VoteCertificate {
  voter: string;
  proposalId: string;
  votingPower: number;
  expiresAt: number;
  signature: string;
  breakdown: {
    base: number;
    xLinked: number;
    telegram: number;
    rankBonus: number;
  };
}

// Result of a vote transaction
export interface VoteResult {
  success: boolean;
  digest?: string;
  votingPower?: number;
  error?: string;
}

// Proposal field types (matching Move contract v2)
export interface ProposalFields {
  // Vote counts (number of voters)
  vote_count_yes: string | number;
  vote_count_no: string | number;
  // Voting power totals
  total_power_yes: string | number;
  total_power_no: string | number;
  expiration: string | number;
  title: string;
  description: string;
  creator: string;
  voters: { fields: { id: { id: string } } };
  status: ProposalStatus;
  [key: string]: unknown;
}
