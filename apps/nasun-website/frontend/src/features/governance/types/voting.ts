// Governance types

export type SuiID = {
  id: string;
};

// Proposal type determines voting rules and gas payment
// - Governance: User pays gas, binding decision for protocol changes
// - Poll: Sponsored (zero gas), non-binding community sentiment
export type ProposalType = "Governance" | "Poll";

// Vote history for My Account page
export interface VoteHistory {
  proposalId: string;
  proposalTitle: string;
  voteYes: boolean;
  votingPower: number;
  timestamp: number;
  proposalStatus: "Active" | "Passed" | "Failed" | "Delisted";
}

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
  expiration: number;
  creator: string;
  voters: string; // Table ID
}

export interface VoteNft {
  id: SuiID;
  proposalId: string;
  url: string;
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
