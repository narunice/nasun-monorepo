import { useSuiClientQueries, useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { VoteHistory, ProposalFields, ProposalStatus } from "../types/voting";

interface VoteNftFields {
  proposal_id: string;
  url: string;
  voting_power: string | number;
  id: { id: string };
}

/**
 * Determine vote direction from VoteProofNFT URL
 * Supports both legacy Sirv CDN format and new IPFS format:
 * - Legacy: vote_yes_nft.jpg / vote_no_nft.jpg
 * - IPFS: CID-based URLs from Pinata gateway
 */
const YES_VOTE_CID = "bafybeidqzi47x2iue4cyjsn6lduh33ca5y362s4k3dk3eh7ornsa4wzhea";
const NO_VOTE_CID = "bafybeih5vmxazgn7jkyzt3ssi4kbia2pteaq7r6a6svhtmr37oh3c36iui";

function isVoteYesFromUrl(url: string | undefined): boolean {
  if (!url) return true;
  // Legacy Sirv CDN format
  if (url.includes("vote_yes")) return true;
  if (url.includes("vote_no")) return false;
  // New IPFS format
  if (url.includes(YES_VOTE_CID)) return true;
  if (url.includes(NO_VOTE_CID)) return false;
  return true; // unknown format fallback
}

/**
 * Hook to fetch user's vote history with proposal details
 * @param limit - Maximum number of votes to return (default: 5)
 */
export function useVoteHistory(limit = 5) {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const ownerAddress = account?.address || zkLoginState?.address;
  const originalPackageId = useNetworkVariable("originalPackageId");
  const dashboardId = useNetworkVariable("dashboardId");

  // Fetch user's Vote NFTs
  const {
    data: voteNftsRes,
    isLoading: isLoadingNfts,
    error: nftsError,
  } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: ownerAddress as string,
      options: {
        showContent: true,
      },
      filter: {
        StructType: `${originalPackageId}::proposal::VoteProofNFT`,
      },
    },
    {
      enabled: !!ownerAddress && !!originalPackageId,
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
