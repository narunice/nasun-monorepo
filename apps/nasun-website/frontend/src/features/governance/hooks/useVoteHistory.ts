import { useSuiClientQueries, useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet } from "@nasun/wallet";
import { VoteHistory, ProposalFields, ProposalStatus } from "../types/voting";
import { SuiObjectData } from "@mysten/sui/client";

interface VoteNftFields {
  proposal_id: string;
  url: string;
  voting_power: string | number;
  id: { id: string };
}

/**
 * Determine vote direction from VoteProofNFT URL
 * The Move contract encodes vote direction in the NFT image URL:
 * - vote_yes_nft.jpg = Yes vote
 * - vote_no_nft.jpg = No vote
 */
function isVoteYesFromUrl(url: string | undefined): boolean {
  if (!url) return true; // fallback
  return url.includes("vote_yes");
}

/**
 * Hook to fetch user's vote history with proposal details
 * @param limit - Maximum number of votes to return (default: 5)
 */
export function useVoteHistory(limit = 5) {
  const { account } = useWallet();
  const packageId = useNetworkVariable("packageId");
  const dashboardId = useNetworkVariable("dashboardId");

  // Fetch user's Vote NFTs
  const {
    data: voteNftsRes,
    isLoading: isLoadingNfts,
    error: nftsError,
  } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: account?.address as string,
      options: {
        showContent: true,
      },
      filter: {
        StructType: `${packageId}::proposal::VoteProofNFT`,
      },
    },
    {
      enabled: !!account?.address && !!packageId,
    }
  );

  // Fetch Dashboard to get total proposals count
  const { data: dashboardRes, isLoading: isLoadingDashboard } =
    useSuiClientQuery(
      "getObject",
      {
        id: dashboardId,
        options: {
          showContent: true,
        },
      },
      {
        enabled: !!dashboardId,
      }
    );

  // Extract proposal IDs from Vote NFTs
  const voteNfts = voteNftsRes?.data || [];
  const proposalIds = voteNfts
    .map((nft) => {
      if (nft.data?.content?.dataType !== "moveObject") return null;
      const fields = nft.data.content.fields as VoteNftFields;
      return fields.proposal_id;
    })
    .filter((id): id is string => id !== null);

  // Fetch proposal details for each vote
  const proposalQueries = useSuiClientQueries({
    queries: proposalIds.map((id) => ({
      method: "getObject" as const,
      params: {
        id,
        options: {
          showContent: true,
        },
      },
    })),
    combine: (results) => {
      return {
        data: results.map((r) => r.data),
        isLoading: results.some((r) => r.isLoading),
        isError: results.some((r) => r.isError),
      };
    },
  });

  // Get total proposals from Dashboard
  const totalProposals = (() => {
    if (dashboardRes?.data?.content?.dataType !== "moveObject") return 0;
    const fields = dashboardRes.data.content.fields as {
      proposals_ids?: string[];
    };
    return fields.proposals_ids?.length || 0;
  })();

  // Combine Vote NFT data with Proposal data
  const history: VoteHistory[] = voteNfts
    .map((nft, index) => {
      if (nft.data?.content?.dataType !== "moveObject") return null;
      const voteFields = nft.data.content.fields as VoteNftFields;

      const proposalData = proposalQueries.data[index];
      if (proposalData?.data?.content?.dataType !== "moveObject") return null;

      const proposalFields = proposalData.data.content.fields as ProposalFields;

      // Determine proposal status
      const isExpired = Number(proposalFields.expiration) < Date.now();
      const status = proposalFields.status as ProposalStatus;
      let proposalStatus: VoteHistory["proposalStatus"];

      if (status.variant === "Delisted") {
        proposalStatus = "Delisted";
      } else if (isExpired) {
        const yesVotes = Number(proposalFields.total_power_yes) || 0;
        const noVotes = Number(proposalFields.total_power_no) || 0;
        proposalStatus = yesVotes > noVotes ? "Passed" : "Failed";
      } else {
        proposalStatus = "Active";
      }

      return {
        proposalId: voteFields.proposal_id,
        proposalTitle: proposalFields.title,
        voteYes: isVoteYesFromUrl(voteFields.url),
        votingPower: Number(voteFields.voting_power) || 1,
        timestamp: Number(proposalFields.expiration) - 7 * 24 * 60 * 60 * 1000, // Approximate vote time
        proposalStatus,
      };
    })
    .filter((item): item is VoteHistory => item !== null)
    .slice(0, limit);

  const votedProposals = voteNfts.length;
  const participationRate =
    totalProposals > 0 ? (votedProposals / totalProposals) * 100 : 0;

  return {
    history,
    totalCount: votedProposals,
    stats: {
      totalProposals,
      votedProposals,
      participationRate,
    },
    isLoading: isLoadingNfts || isLoadingDashboard || proposalQueries.isLoading,
    error: nftsError,
  };
}
