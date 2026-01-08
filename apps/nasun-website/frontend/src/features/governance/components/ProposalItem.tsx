import { useSuiClientQuery } from "@mysten/dapp-kit";
import { FC, useState } from "react";
import { EcText } from "@/components/ui/Shared";
import { SuiObjectData } from "@mysten/sui/client";
import { Proposal, VoteNft, ProposalFields, ProposalType } from "../types/voting";
import { VoteModal } from "./VoteModal";
import { useProposalType } from "../hooks/useProposalType";
import { toast } from "react-toastify";

interface ProposalItemsProps {
  id: string;
  voteNft: VoteNft | undefined;
  onVoteTxSuccess: () => void | Promise<void>;
}

export const ProposalItem: FC<ProposalItemsProps> = ({ id, voteNft, onVoteTxSuccess }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    data: dataResponse,
    refetch: refetchProposal,
    error,
    isPending,
  } = useSuiClientQuery("getObject", {
    id,
    options: {
      showContent: true,
    },
  });

  // Get proposal type from registry
  const { proposalType, isLoading: isTypeLoading } = useProposalType(id);

  if (isPending || isTypeLoading) return <EcText centered text="Loading..." />;
  if (error) return <EcText isError text={`Error: ${error.message}`} />;
  if (!dataResponse.data) return null;

  const proposal = parseProposal(dataResponse.data, proposalType);

  console.log(proposal);

  if (!proposal) return <EcText text="No data found" />;

  const expiration = proposal.expiration;
  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(expiration) || isDelisted;

  return (
    <>
      <div
        onClick={() => {
          if (isExpired) {
            toast.info(isDelisted ? "This proposal has been delisted" : "Voting period has ended", { autoClose: 2000 });
          } else {
            setIsModalOpen(true);
          }
        }}
        className={`p-4 md:p-5 border rounded-lg backdrop-blur-md transition-colors duration-200
          ${
            isExpired
              ? "cursor-not-allowed border-nasun-white/30 bg-nasun-c6/30"
              : "cursor-pointer border-nasun-c5/50 bg-nasun-c6/50 hover:border-nasun-c4 hover:bg-nasun-c4/10"
          }`}
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <p
              className={`text-xl font-medium ${
                isExpired ? "text-nasun-white/50" : "text-nasun-white"
              }`}
            >
              {proposal.title}
            </p>
            {/* Proposal type badge */}
            {proposal.proposalType === "Poll" ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/50">
                Poll
              </span>
            ) : (
              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/50">
                Governance
              </span>
            )}
          </div>
          {!!voteNft && (
            <img
              className="w-8 h-8 rounded-full flex-shrink-0 ml-2"
              src={voteNft?.url}
              alt="Vote NFT"
            />
          )}
        </div>
        <p className={`mb-4 ${isExpired ? "text-nasun-white/50" : "text-nasun-white/85"}`}>
          {proposal.description}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex space-x-4">
            <div
              className={`flex items-center ${isExpired ? "text-green-700" : "text-green-500"}`}
            >
              <span className="mr-1">👍</span>
              {proposal.yesVotes}
            </div>
            <div className={`flex items-center ${isExpired ? "text-red-700" : "text-red-500"}`}>
              <span className="mr-1">👎</span>
              {proposal.noVotes}
            </div>
          </div>
          <p className={`text-sm ${isExpired ? "text-nasun-white/50" : "text-nasun-white/70"}`}>
            {isDelisted ? "Delisted" : formatUnixTime(expiration)}
          </p>
        </div>
      </div>
      <VoteModal
        proposal={proposal}
        hasVoted={!!voteNft}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={async (votedYes: boolean) => {
          console.log(votedYes);
          // Wait for blockchain to reflect the vote, then refetch proposal
          await new Promise(resolve => setTimeout(resolve, 1500));
          await refetchProposal();
          await onVoteTxSuccess();
          setIsModalOpen(false);
        }}
      />
    </>
  );
};

function parseProposal(data: SuiObjectData, proposalType: ProposalType): Proposal | null {
  if (data.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as ProposalFields;

  // Required field validation (using Move contract field names)
  if (
    !fields.title ||
    !fields.description ||
    !fields.status ||
    !fields.creator ||
    !fields.voters
  ) {
    console.error("Missing required proposal fields", fields);
    return null;
  }

  return {
    id: { id: data.objectId }, // Use objectId from SuiObjectData
    title: fields.title,
    description: fields.description,
    status: fields.status,
    proposalType,
    // Use total voting power instead of vote count
    yesVotes: (Number(fields.total_power_yes) || 0).toString(),
    noVotes: (Number(fields.total_power_no) || 0).toString(),
    expiration: Number(fields.expiration),
    creator: fields.creator,
    voters: fields.voters?.fields?.id?.id || "",
  };
}

function isUnixTimeExpired(unixTimeMs: number) {
  return new Date(unixTimeMs) < new Date();
}

function formatUnixTime(timestampMs: number) {
  if (isUnixTimeExpired(timestampMs)) {
    return "Expired";
  }

  return new Date(timestampMs).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
