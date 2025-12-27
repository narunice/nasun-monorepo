import { useSuiClientQuery } from "@mysten/dapp-kit";
import { FC, useState } from "react";
import { EcText } from "../../../ui/Shared";
import { SuiObjectData } from "@mysten/sui/client";
import { Proposal, VoteNft, ProposalFields } from "../../../../types/voting";
import { VoteModal } from "./VoteModal";

interface ProposalItemsProps {
  id: string;
  voteNft: VoteNft | undefined;
  onVoteTxSuccess: () => void;
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

  if (isPending) return <EcText centered text="Loading..." />;
  if (error) return <EcText isError text={`Error: ${error.message}`} />;
  if (!dataResponse.data) return null;

  const proposal = parseProposal(dataResponse.data);

  console.log(proposal);

  if (!proposal) return <EcText text="No data found" />;

  const expiration = proposal.expiration;
  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(expiration) || isDelisted;

  return (
    <>
      <div
        onClick={() => !isExpired && setIsModalOpen(true)}
        className={`${isExpired ? "cursor-not-allowed border-gray-600" : "hover:border-red-800"}
          p-4 border rounded-lg shadow-sm bg-gray-800 cursor-pointer`}
      >
        <div className="flex justify-between">
          <p
            className={`${
              isExpired ? "text-gray-600" : "text-gray-300"
            } text-xl font-semibold mb-2`}
          >
            {proposal.title}
          </p>
          {!!voteNft && <img className="w-8 h-8 rounded-lg-full" src={voteNft?.url} />}
        </div>
        <p className={`${isExpired ? "text-gray-600" : "text-gray-300"} `}>
          {proposal.description}
        </p>
        <div className="flex items-center justify-between mt-4">
          <div className="flex space-x-4">
            <div className={`${isExpired ? "text-green-800" : "text-green-600"} flex items-center`}>
              <span className="mr-1">👍</span>
              {proposal.yesVotes}
            </div>
            <div className={`${isExpired ? "text-red-800" : "text-red-600"} flex items-center`}>
              <span className="mr-1">👎</span>
              {proposal.noVotes}
            </div>
          </div>
          <div>
            <p className={`${isExpired ? "text-gray-600" : "text-gray-400"} text-sm`}>
              {isDelisted ? "Delisted" : formatUnixTime(expiration)}
            </p>
          </div>
        </div>
      </div>
      <VoteModal
        proposal={proposal}
        hasVoted={!!voteNft}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVote={(votedYes: boolean) => {
          console.log(votedYes);
          refetchProposal();
          onVoteTxSuccess();
          setIsModalOpen(false);
        }}
      />
    </>
  );
};

function parseProposal(data: SuiObjectData): Proposal | null {
  if (data.content?.dataType !== "moveObject") return null;

  const fields = data.content.fields as ProposalFields;

  // 필수 필드 검증 (Move 컨트랙트 필드명 사용)
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
    id: { id: data.objectId }, // SuiObjectData의 objectId 사용
    title: fields.title,
    description: fields.description,
    status: fields.status,
    yesVotes: Number(fields.voted_yes_count).toString(),
    noVotes: Number(fields.voted_no_count).toString(),
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
