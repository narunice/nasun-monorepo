import { ProposalType, SuiID } from "./voting";

export type MultiChoiceProposalStatus = {
  variant: "Active" | "Delisted";
};

export interface MultiChoiceProposal {
  id: SuiID;
  title: string;
  description: string;
  choices: string[];
  choicePowers: number[];
  choiceCounts: number[];
  useEqualWeight: boolean;
  expiration: number;
  creator: string;
  status: MultiChoiceProposalStatus;
  proposalType: ProposalType;
  voters: string; // Table ID
}

export interface MultiChoiceProposalFields {
  title: string;
  description: string;
  choices: string[];
  choice_powers: (string | number)[];
  choice_counts: (string | number)[];
  use_equal_weight: boolean;
  expiration: string | number;
  creator: string;
  status: MultiChoiceProposalStatus;
  voters: { fields: { id: { id: string } } };
  [key: string]: unknown;
}
