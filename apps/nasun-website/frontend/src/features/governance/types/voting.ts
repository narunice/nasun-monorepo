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

// Proposal field types (matching Move contract)
export interface ProposalFields {
  voted_yes_count: string | number;
  voted_no_count: string | number;
  expiration: string | number;
  title: string;
  description: string;
  creator: string;
  voters: { fields: { id: { id: string } } };
  status: ProposalStatus;
  [key: string]: unknown;
}
