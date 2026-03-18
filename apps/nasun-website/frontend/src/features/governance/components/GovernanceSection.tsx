import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { PaginatedObjectsResponse, SuiObjectData } from "@mysten/sui/client";
import { ProposalItem } from "./ProposalItem";
import { MultiChoiceProposalItem } from "./MultiChoiceProposalItem";
import { useVoteNfts } from "../hooks/useVoteNfts";
import { useMultiChoiceVoteNfts } from "../hooks/useMultiChoiceVoteNfts";
import { VoteNft } from "../types/voting";
import { isMultiChoiceProposal } from "../utils/proposalHelpers";
import { SectionLayout } from "@/components/layout/SectionLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { FC, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchHiddenProposalIds } from "../utils/hiddenProposals";
import { SectionLoading, InlineLoading, PageTitle } from "@/components/ui";
import { ButtonV3 } from "@/components/ui/button-v3";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useAuth } from "@/features/auth";
import { VotingPowerSummary } from "./VotingPowerSummary";
import { GovernanceStats } from "./GovernanceStats";
import { ChevronDown, ChevronUp } from "lucide-react";

type ProposalFilter = "all" | "active" | "expired";

/**
 * GovernanceSection
 *
 * Main section component for the Governance page.
 * Queries proposals from the blockchain and provides voting UI.
 */
const GovernanceSection = () => {
  const { t } = useTranslation(["proposals", "common"]);
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { isAuthenticated } = useAuth();
  const isConnected = (status === "unlocked" && account) || isZkConnected;
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <SectionLayout className="!max-w-6xl gap-6 md:gap-8 lg:gap-10">
      <PageTitle as="h2" align="center">
        {t("proposals:title")}
      </PageTitle>

      {/* User Governance Info Section */}
      {isConnected ? (
        <div className="space-y-4">
          {/* Header with Wallet and Toggle */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <ButtonV3
              variant="nw1"
              outline
              size="lg"
              onClick={() => setIsInfoOpen(!isInfoOpen)}
              className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start"
            >
              <span>{t("proposals:section.myGovernanceInfo")}</span>
              {isInfoOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </ButtonV3>
          </div>

          {/* Collapsible Governance Info Panel */}
          {isInfoOpen && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <VotingPowerSummary />
                <GovernanceStats />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <p className="text-sm text-nasun-white/50">
            {isAuthenticated && !isConnected
              ? t("proposals:wallet.locked")
              : t("proposals:section.connectToParticipate")}
          </p>
        </div>
      )}

      {/* Proposals Section */}
      <div className="mt-4">
        <ErrorBoundary fallback={<div>{t("common:error.generic")}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <ProposalList />
          </Suspense>
        </ErrorBoundary>
      </div>
    </SectionLayout>
  );
};

export default GovernanceSection;

// Internal component for proposal list rendering
const ProposalList = () => {
  const { t } = useTranslation(["common", "proposals"]);
  const dashboardId = useNetworkVariable("dashboardId");
  const { account } = useWallet();
  const { data: voteNftsRes, refetch: refetchNfts, error: nftsError } = useVoteNfts();
  const { data: mcVoteNftsRes, refetch: refetchMcNfts } = useMultiChoiceVoteNfts();
  const [filter, setFilter] = useState<ProposalFilter>("all");

  const { data: hiddenIdsArray = [], isPending: isHiddenPending } = useQuery({
    queryKey: ["hiddenProposals"],
    queryFn: fetchHiddenProposalIds,
    staleTime: 30 * 1000,
  });
  const hiddenIds = new Set(hiddenIdsArray);

  const {
    data: dataResponse,
    isPending: isDashboardPending,
    error: dashboardError,
  } = useSuiClientQuery("getObject", {
    id: dashboardId,
    options: {
      showContent: true,
    },
  });

  if (isDashboardPending || isHiddenPending) {
    return <SectionLoading showLayout={false} />;
  }

  if (dashboardError || (account && nftsError)) {
    const error = dashboardError || nftsError;
    return (
      <div className="text-red-500">
        {t("error.generic")}
      </div>
    );
  }

  if (!dataResponse?.data) {
    return <div className="text-red-500">{t("error.generic")}</div>;
  }

  const voteNfts = extractVoteNfts(voteNftsRes);
  const mcVoteNfts = extractVoteNfts(mcVoteNftsRes);
  const proposalIds = getDashboardFields(dataResponse.data)?.proposals_ids || [];
  const visibleProposalIds = proposalIds.filter((id) => !hiddenIds.has(id));

  if (visibleProposalIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-5xl mb-4">📋</div>
        <p className="text-lg text-nasun-white/70">{t("none_found", { ns: "proposals" })}</p>
      </div>
    );
  }

  const filterButtons: { value: ProposalFilter; label: string }[] = [
    { value: "all", label: t("proposals:section.filterAll") },
    { value: "active", label: t("proposals:section.filterActive") },
    { value: "expired", label: t("proposals:section.filterExpired") },
  ];

  return (
    <div>
      {/* Filter Buttons */}
      <div className="flex gap-2 mb-4">
        {filterButtons.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 text-sm rounded-sm border transition-colors ${
              filter === value
                ? "bg-nasun-nw1/20 text-nasun-nw1 border-nasun-nw1/40"
                : "bg-transparent text-nasun-white/50 border-nasun-white/10 hover:text-nasun-white/80 hover:border-nasun-white/20"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleProposalIds.map((id) => (
          <ErrorBoundary key={id} fallback={<div>{t("error.generic")}</div>}>
            <Suspense fallback={<InlineLoading size="sm" />}>
              <SmartProposalItem
                id={id}
                filter={filter}
                onVoteTxSuccess={async () => {
                  for (let i = 0; i < 5; i++) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await refetchNfts();
                    await refetchMcNfts();
                  }
                }}
                voteNft={voteNfts.find((nft) => nft.proposalId === id)}
                mcVoteNft={mcVoteNfts.find((nft) => nft.proposalId === id)}
              />
            </Suspense>
          </ErrorBoundary>
        ))}
      </div>
    </div>
  );
};

// Helper functions
function getDashboardFields(data: SuiObjectData) {
  if (data.content?.dataType !== "moveObject") return null;

  return data.content.fields as {
    id: { id: string };
    proposals_ids: string[];
  };
}

function extractVoteNfts(nftRes: PaginatedObjectsResponse | undefined) {
  if (!nftRes?.data) return [];

  return nftRes.data.map((nftObject) => getVoteNft(nftObject.data));
}

type VoteNftFields = {
  proposal_id: string;
  url: string;
  id: { id: string };
};

/**
 * SmartProposalItem - Routes to the correct component based on on-chain object type.
 * Uses React Query cache, so the subsequent fetch inside ProposalItem/MultiChoiceProposalItem is free.
 */
const SmartProposalItem: FC<{
  id: string;
  filter: ProposalFilter;
  voteNft: VoteNft | undefined;
  mcVoteNft: VoteNft | undefined;
  onVoteTxSuccess: () => void | Promise<void>;
}> = ({ id, filter, voteNft, mcVoteNft, onVoteTxSuccess }) => {
  const { data, isPending, error } = useSuiClientQuery("getObject", {
    id,
    options: { showContent: true },
  });

  if (isPending) return <InlineLoading size="sm" />;
  if (error) return <div className="text-red-400 text-sm p-4">Failed to load proposal</div>;

  const objectType = data?.data?.content?.dataType === "moveObject"
    ? (data.data.content.type ?? "")
    : "";

  if (isMultiChoiceProposal(objectType)) {
    return (
      <MultiChoiceProposalItem
        id={id}
        filter={filter}
        hasVoted={!!mcVoteNft}
        voteNftUrl={mcVoteNft?.url}
        onVoteTxSuccess={onVoteTxSuccess}
      />
    );
  }

  return (
    <ProposalItem
      id={id}
      filter={filter}
      voteNft={voteNft}
      onVoteTxSuccess={onVoteTxSuccess}
    />
  );
};

function getVoteNft(nftData: SuiObjectData | undefined | null): VoteNft {
  if (nftData?.content?.dataType !== "moveObject") {
    return { id: { id: "" }, url: "", proposalId: "" };
  }

  const { proposal_id: proposalId, url, id } = nftData.content.fields as VoteNftFields;

  return {
    proposalId,
    id,
    url,
  };
}
