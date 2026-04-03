/**
 * useGovernanceMission Hook
 *
 * Checks if there are active governance proposals the user hasn't voted on.
 * Used by DailyMissionsCard to show a conditional "Vote on Proposal" item.
 *
 * Data flow:
 *   1. Fetch Dashboard object -> get proposal IDs
 *   2. Fetch each proposal object -> filter active (not expired, not delisted)
 *   3. Fetch user's VoteProofNFTs -> extract voted proposal IDs
 *   4. Return unvoted active proposals
 */

import { useMemo } from "react";
import { useSuiClientQuery, useSuiClientQueries } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";

interface GovernanceMissionState {
  /** Whether there's at least one active proposal the user hasn't voted on */
  hasUnvotedProposal: boolean;
  /** Number of active proposals not yet voted on */
  unvotedCount: number;
  /** Still loading data */
  isLoading: boolean;
}

export function useGovernanceMission(): GovernanceMissionState {
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const ownerAddress = account?.address || zkLoginState?.address;

  const dashboardId = useNetworkVariable("dashboardId");
  const originalPackageId = useNetworkVariable("originalPackageId");
  const multiChoicePackageId = useNetworkVariable("multiChoicePackageId");

  // 1. Fetch Dashboard to get all proposal IDs
  const { data: dashboardRes, isLoading: isDashboardLoading } =
    useSuiClientQuery(
      "getObject",
      { id: dashboardId, options: { showContent: true } },
      { enabled: !!dashboardId },
    );

  const allProposalIds = useMemo(() => {
    if (dashboardRes?.data?.content?.dataType !== "moveObject") return [];
    const fields = dashboardRes.data.content.fields as {
      proposals_ids?: string[];
    };
    return fields.proposals_ids ?? [];
  }, [dashboardRes]);

  // 2. Fetch proposal objects to check expiration/status
  const proposalQueries = useSuiClientQueries({
    queries: allProposalIds.map((id) => ({
      method: "getObject" as const,
      params: { id, options: { showContent: true } },
    })),
    combine: (results) => ({
      data: results.map((r) => r.data),
      isLoading: results.some((r) => r.isLoading),
    }),
  });

  const activeProposalIds = useMemo(() => {
    const now = Date.now();
    const active: string[] = [];
    for (let i = 0; i < allProposalIds.length; i++) {
      const obj = proposalQueries.data[i];
      if (obj?.data?.content?.dataType !== "moveObject") continue;
      const fields = obj.data.content.fields as {
        expiration: string | number;
        status: { variant: string };
      };
      const expiration = Number(fields.expiration);
      if (fields.status.variant === "Delisted") continue;
      if (expiration <= now) continue;
      active.push(allProposalIds[i]);
    }
    return active;
  }, [allProposalIds, proposalQueries.data]);

  // 3. Fetch user's VoteProofNFTs (regular + multi-choice)
  const { data: voteNftsRes, isLoading: isVoteLoading } = useSuiClientQuery(
    "getOwnedObjects",
    {
      owner: ownerAddress as string,
      options: { showContent: true },
      filter: {
        StructType: `${originalPackageId}::proposal::VoteProofNFT`,
      },
    },
    { enabled: !!ownerAddress && !!originalPackageId, gcTime: 0 },
  );

  const { data: mcVoteNftsRes, isLoading: isMcVoteLoading } =
    useSuiClientQuery(
      "getOwnedObjects",
      {
        owner: ownerAddress as string,
        options: { showContent: true },
        filter: {
          StructType: `${multiChoicePackageId}::multi_choice_proposal::MultiChoiceVoteProofNFT`,
        },
      },
      { enabled: !!ownerAddress && !!multiChoicePackageId, gcTime: 0 },
    );

  const votedProposalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const nft of voteNftsRes?.data ?? []) {
      if (nft.data?.content?.dataType !== "moveObject") continue;
      const fields = nft.data.content.fields as { proposal_id: string };
      ids.add(fields.proposal_id);
    }
    for (const nft of mcVoteNftsRes?.data ?? []) {
      if (nft.data?.content?.dataType !== "moveObject") continue;
      const fields = nft.data.content.fields as { proposal_id: string };
      ids.add(fields.proposal_id);
    }
    return ids;
  }, [voteNftsRes, mcVoteNftsRes]);

  // 4. Compute unvoted active proposals
  const unvotedActiveIds = useMemo(
    () => activeProposalIds.filter((id) => !votedProposalIds.has(id)),
    [activeProposalIds, votedProposalIds],
  );

  const isLoading =
    isDashboardLoading ||
    proposalQueries.isLoading ||
    isVoteLoading ||
    isMcVoteLoading;

  return {
    hasUnvotedProposal: unvotedActiveIds.length > 0,
    unvotedCount: unvotedActiveIds.length,
    isLoading,
  };
}
