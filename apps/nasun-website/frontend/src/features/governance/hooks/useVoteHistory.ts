import { useMemo } from "react";
import { useSuiClient, useSuiClientQuery } from "@mysten/dapp-kit";
import { SuiClient, SuiObjectResponse } from "@mysten/sui/client";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { VoteHistory } from "../types/voting";
import {
  fetchHiddenProposalIds,
  HIDDEN_PROPOSALS_QUERY_KEY,
  HIDDEN_PROPOSALS_STALE_TIME,
} from "../utils/hiddenProposals";
import {
  buildVoteHistoryEntry,
  chunk,
  computeParticipation,
  extractVotedProposalIds,
  MULTI_GET_OBJECTS_LIMIT,
  orderVotedProposalIds,
  readDashboardProposalIds,
  readVotersTableId,
  selectVisibleProposalIds,
} from "../utils/voteHistoryParsers";
import { useVoteNfts } from "./useVoteNfts";
import { useMultiChoiceVoteNfts } from "./useMultiChoiceVoteNfts";

const VOTE_HISTORY_QUERY_KEY = "governance-vote-history";

async function fetchVoteHistoryEntries(
  client: SuiClient,
  voter: string,
  proposalIds: string[]
): Promise<VoteHistory[]> {
  const now = Date.now();

  const proposals: SuiObjectResponse[] = [];
  for (const ids of chunk(proposalIds, MULTI_GET_OBJECTS_LIMIT)) {
    proposals.push(
      ...(await client.multiGetObjects({ ids, options: { showContent: true } }))
    );
  }

  // Rows are paired with ids by position, so a short response would shift every
  // vote onto the wrong proposal. That mispairing is the defect this guard
  // exists to make impossible rather than merely unlikely.
  if (proposals.length !== proposalIds.length) {
    throw new Error(
      `Proposal lookup returned ${proposals.length} of ${proposalIds.length} objects`
    );
  }

  const entries = await Promise.all(
    proposals.map(async (proposal, index) => {
      const proposalId = proposalIds[index];

      // A registered id with no object behind it. proposal::remove deletes the
      // object without touching dashboard.proposals_ids, so one admin removal
      // would otherwise fail every row for every wallet, permanently. The
      // proposal list degrades per row for the same reason. Any other code,
      // including unknown, still fails the query: that is an outage, and
      // dropping the row would cache a missing vote as a resolved result.
      const proposalErrorCode = proposal.error?.code;
      if (proposalErrorCode === "notExists" || proposalErrorCode === "deleted") {
        console.warn(
          `Vote history: proposal ${proposalId} is registered but ${proposalErrorCode}`
        );
        return null;
      }

      const votersTableId = readVotersTableId(proposal.data);
      if (!votersTableId) {
        throw new Error(`Proposal ${proposalId} could not be read`);
      }

      // A voter with no row here comes back as { error: dynamicFieldNotFound }
      // rather than a rejection, so this resolves for non-voters too.
      const field = await client.getDynamicFieldObject({
        parentId: votersTableId,
        name: { type: "address", value: voter },
      });

      if (field.error) {
        // Only dynamicFieldNotFound means "this wallet has no row". Any other
        // code (unknown, deleted, ...) is the node failing to answer, and
        // reading it as "never voted" would hide the vote behind an outage.
        if (field.error.code !== "dynamicFieldNotFound") {
          throw new Error(`Voter record lookup failed: ${field.error.code}`);
        }

        // A proof with no record on chain is what admin_restore_vote_proof
        // issues after a devnet reset. That is a known state, not an outage, so
        // the row drops out instead of failing the rows beside it.
        console.warn(`Vote history: no vote record on proposal ${proposalId}`);
        return null;
      }

      const entry = buildVoteHistoryEntry(
        proposalId,
        proposal.data,
        field.data,
        now
      );

      // Every row here is one the caller will render. Resolving the query
      // without it would drop the vote silently, and react-query would not
      // retry, so a wallet that has voted would read as one that has not.
      if (!entry) {
        throw new Error(`Vote record on proposal ${proposalId} is unreadable`);
      }
      return entry;
    })
  );

  return entries.filter((entry): entry is VoteHistory => entry !== null);
}

/**
 * The connected wallet's vote history and participation, over both proposal
 * kinds.
 *
 * @param limit - Maximum number of rows to resolve. Pass 0 for stats only, which
 * skips the per-row lookups entirely.
 */
export function useVoteHistory(limit = 5) {
  const suiClient = useSuiClient();
  const { account } = useWallet();
  const { state: zkLoginState } = useZkLogin();
  const ownerAddress = account?.address || zkLoginState?.address;
  const dashboardId = useNetworkVariable("dashboardId");

  // Both proof lists come from the hooks the governance page already runs, so
  // that page now resolves each list once instead of twice.
  const {
    data: binaryProofs,
    isLoading: isLoadingBinaryProofs,
    error: binaryProofsError,
  } = useVoteNfts();
  const {
    data: multiChoiceProofs,
    isLoading: isLoadingMultiChoiceProofs,
    error: multiChoiceProofsError,
  } = useMultiChoiceVoteNfts();

  const {
    data: dashboardRes,
    isLoading: isLoadingDashboard,
    error: dashboardError,
  } = useSuiClientQuery(
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

  const { data: hiddenProposalIds, isLoading: isLoadingHidden } = useQuery({
    queryKey: HIDDEN_PROPOSALS_QUERY_KEY,
    queryFn: fetchHiddenProposalIds,
    staleTime: HIDDEN_PROPOSALS_STALE_TIME,
  });

  // Null until both proof lists are in hand. Counting one list alone is exactly
  // what reported 0% for a wallet that had voted, so a half-known numerator is
  // withheld rather than published.
  const votedProposalIds = useMemo(() => {
    if (!binaryProofs || !multiChoiceProofs) return null;

    return new Set([
      ...extractVotedProposalIds(binaryProofs.data),
      ...extractVotedProposalIds(multiChoiceProofs.data),
    ]);
  }, [binaryProofs, multiChoiceProofs]);

  const registeredProposalIds = useMemo(
    () => readDashboardProposalIds(dashboardRes?.data),
    [dashboardRes]
  );

  const hiddenIds = useMemo(
    () => (hiddenProposalIds ? new Set(hiddenProposalIds) : null),
    [hiddenProposalIds]
  );

  // Rows are drawn from the proposals the public list shows, newest first, and
  // only the rows that will be rendered get looked up. When the hidden list is
  // unavailable the filter is skipped rather than guessed: that can surface a
  // hidden proposal in someone's own history, which is milder than blanking
  // their history because the admin API is down. Participation is withheld in
  // that case instead, since a rate needs a denominator we can stand behind.
  const historyProposalIds = useMemo(() => {
    const listed = hiddenIds
      ? selectVisibleProposalIds(registeredProposalIds ?? [], hiddenIds)
      : registeredProposalIds ?? [];
    return orderVotedProposalIds(
      votedProposalIds ?? new Set<string>(),
      listed
    ).slice(0, limit);
  }, [registeredProposalIds, hiddenIds, votedProposalIds, limit]);

  const {
    data: history = [],
    isLoading: isLoadingHistory,
    error: historyError,
  } = useQuery({
    queryKey: [VOTE_HISTORY_QUERY_KEY, ownerAddress, historyProposalIds],
    queryFn: () =>
      fetchVoteHistoryEntries(
        suiClient,
        ownerAddress as string,
        historyProposalIds
      ),
    enabled: !!ownerAddress && historyProposalIds.length > 0,
    gcTime: 0,
  });

  const stats = useMemo(
    () =>
      computeParticipation(registeredProposalIds, hiddenIds, votedProposalIds),
    [registeredProposalIds, hiddenIds, votedProposalIds]
  );

  return {
    history,
    // null when the visible proposal set could not be established.
    stats,
    isLoading:
      isLoadingBinaryProofs ||
      isLoadingMultiChoiceProofs ||
      isLoadingDashboard ||
      isLoadingHidden ||
      isLoadingHistory,
    // A failed history lookup has to reach the caller too, or the card shows
    // an empty list as though the wallet had never voted.
    // The dashboard read decides which rows exist, so its failure has to reach
    // the caller as well. Left unreported it yields an empty list, and a wallet
    // that has voted reads as one that never has.
    error:
      binaryProofsError ??
      multiChoiceProofsError ??
      dashboardError ??
      historyError,
  };
}
