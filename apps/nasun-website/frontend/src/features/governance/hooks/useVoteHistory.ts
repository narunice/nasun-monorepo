import { useMemo } from "react";
import { useSuiClient, useSuiClientQuery } from "@mysten/dapp-kit";
import { SuiClient } from "@mysten/sui/client";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { VoteHistory } from "../types/voting";
import { fetchAllOwnedObjects } from "../utils/ownedObjects";
import {
  buildVoteHistoryEntry,
  extractVotedProposalIds,
  readVoteRecord,
  readVotersTableId,
} from "../utils/voteHistoryParsers";

const VOTE_PROOFS_QUERY_KEY = "governance-vote-proofs";
const VOTE_HISTORY_QUERY_KEY = "governance-vote-history";

/** Extra candidates resolved so unresolvable rows do not shorten the list. */
const HISTORY_LOOKAHEAD = 3;

async function fetchVoteHistoryEntries(
  client: SuiClient,
  voter: string,
  proposalIds: string[]
): Promise<VoteHistory[]> {
  const now = Date.now();

  const results = await Promise.all(
    proposalIds.map(async (proposalId) => {
      try {
        const proposal = await client.getObject({
          id: proposalId,
          options: { showContent: true },
        });

        const votersTableId = readVotersTableId(proposal.data);
        if (!votersTableId) return { entry: null };

        // A voter with no row here comes back as { error: dynamicFieldNotFound }
        // rather than a rejection, so this resolves for non-voters too.
        const field = await client.getDynamicFieldObject({
          parentId: votersTableId,
          name: { type: "address", value: voter },
        });

        // Only dynamicFieldNotFound means "this wallet has no row". Any other
        // code (unknown, deleted, ...) is the node failing to answer, and
        // reading it as "never voted" would hide the vote behind an outage.
        if (field.error && field.error.code !== "dynamicFieldNotFound") {
          throw new Error(`Voter record lookup failed: ${field.error.code}`);
        }

        return {
          entry: buildVoteHistoryEntry(
            proposalId,
            proposal.data,
            readVoteRecord(field.data),
            now
          ),
        };
      } catch (error) {
        // One unreachable proposal drops its own row and nothing else. Letting
        // it reject would blank the whole list while the vote count beside it
        // still reads non-zero.
        console.warn(
          `Vote history: could not resolve proposal ${proposalId}`,
          error
        );
        return { entry: null, error };
      }
    })
  );

  // Every lookup failing is an outage, not a set of missing rows. Resolving it
  // as an empty list would tell someone who has voted that they never did, with
  // no error shown and nothing to retry.
  const failures = results.filter((result) => "error" in result);
  if (failures.length > 0 && failures.length === results.length) {
    throw failures[0].error;
  }

  return results
    .map((result) => result.entry)
    .filter((entry): entry is VoteHistory => entry !== null);
}

/**
 * Hook to fetch the connected wallet's vote history with proposal details.
 * @param limit - Maximum number of votes to return (default: 5)
 */
export function useVoteHistory(limit = 5) {
  const suiClient = useSuiClient();
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const ownerAddress = account?.address || zkLoginState?.address;
  const originalPackageId = useNetworkVariable("originalPackageId");
  const dashboardId = useNetworkVariable("dashboardId");

  // Vote proofs are keyed only by owner, so every consumer shares one fetch no
  // matter which limit it asked for.
  const {
    data: voteProofs,
    isLoading: isLoadingNfts,
    error: nftsError,
  } = useQuery({
    queryKey: [VOTE_PROOFS_QUERY_KEY, ownerAddress, originalPackageId],
    queryFn: () =>
      fetchAllOwnedObjects(
        suiClient,
        ownerAddress as string,
        `${originalPackageId}::proposal::VoteProofNFT`
      ),
    enabled: !!ownerAddress && !!originalPackageId,
    gcTime: 0,
  });

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

  const votedProposalIds = useMemo(
    () => extractVotedProposalIds(voteProofs?.data),
    [voteProofs]
  );

  // Only the rows that could be shown get proposal and vote-record lookups.
  // Resolving every past vote would cost two RPC calls each. The extra
  // candidates cover rows that turn out to be unresolvable, so a deleted
  // proposal near the top does not shorten the list below `limit`.
  const candidateProposalIds = useMemo(
    () => votedProposalIds.slice(0, limit + HISTORY_LOOKAHEAD),
    [votedProposalIds, limit]
  );

  const {
    data: resolvedHistory,
    isLoading: isLoadingHistory,
    error: historyError,
  } = useQuery({
    queryKey: [VOTE_HISTORY_QUERY_KEY, ownerAddress, candidateProposalIds],
    queryFn: () =>
      fetchVoteHistoryEntries(
        suiClient,
        ownerAddress as string,
        candidateProposalIds
      ),
    enabled: !!ownerAddress && candidateProposalIds.length > 0,
    gcTime: 0,
  });

  const history = useMemo(
    () => (resolvedHistory ?? []).slice(0, limit),
    [resolvedHistory, limit]
  );

  const totalProposals = (() => {
    if (dashboardRes?.data?.content?.dataType !== "moveObject") return 0;
    const fields = dashboardRes.data.content.fields as {
      proposals_ids?: string[];
    };
    return fields.proposals_ids?.length || 0;
  })();

  // Counted from the proof list the history is drawn from. A proof whose
  // proposal or vote record cannot be read still counts here but gets no row.
  const votedProposals = votedProposalIds.length;
  const participationRate =
    totalProposals > 0
      ? Math.min((votedProposals / totalProposals) * 100, 100)
      : 0;

  return {
    history,
    totalCount: votedProposals,
    stats: {
      totalProposals,
      votedProposals,
      participationRate,
    },
    isLoading: isLoadingNfts || isLoadingDashboard || isLoadingHistory,
    // A failed history lookup has to reach the caller too, or the card shows
    // an empty list as though the wallet had never voted.
    error: nftsError ?? historyError,
  };
}
