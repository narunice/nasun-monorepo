// Governance types

export type SuiID = {
  id: string;
};

export type ProposalStatus = {
  variant: "Active" | "Delisted";
};

export interface Proposal {
  id: SuiID;
  title: string;
  description: string;
  status: ProposalStatus;
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
