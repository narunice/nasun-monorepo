// voting.d.ts

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

// Proposal 필드 타입 정의 (Move 컨트랙트와 일치하도록 수정)
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
