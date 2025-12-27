/**
 * Governance Feature Module
 *
 * Blockchain proposal voting system.
 */

// Components
export { ProposalItem } from "./components/ProposalItem";
export { VoteModal } from "./components/VoteModal";
export { default as GovernanceSection } from "./components/GovernanceSection";

// Hooks
export { useVoteNfts } from "./hooks/useVoteNfts";

// Types
export type {
  Proposal,
  ProposalStatus,
  ProposalFields,
  VoteNft,
  SuiID,
} from "./types/voting";
