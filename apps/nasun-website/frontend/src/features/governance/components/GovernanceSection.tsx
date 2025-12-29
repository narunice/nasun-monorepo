import { useSuiClientQuery } from "@mysten/dapp-kit";
import { useNetworkVariable } from "@/config/suiNetworkConfig";
import { PaginatedObjectsResponse, SuiObjectData } from "@mysten/sui/client";
import { ProposalItem } from "./ProposalItem";
import { useVoteNfts } from "../hooks/useVoteNfts";
import { VoteNft } from "../types/voting";
import { SectionLayout } from "@/components/layout/SectionLayout";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionLoading, InlineLoading, PageTitle } from "@/components/ui";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { VotingPowerSummary } from "./VotingPowerSummary";
import { DelegationPanel } from "./DelegationPanel";
import { GovernanceStats } from "./GovernanceStats";

/**
 * GovernanceSection
 *
 * Main section component for the Governance page.
 * Queries proposals from the blockchain and provides voting UI.
 */
const GovernanceSection = () => {
  const { t } = useTranslation(["proposals", "common"]);
  const { status, account } = useWallet();
  const isConnected = status === "unlocked" && account;
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <SectionLayout className="!max-w-6xl gap-6 md:gap-8">
      <PageTitle as="h2" align="center">
        {t("proposals:title")}
      </PageTitle>

      {/* User Governance Info Section */}
      {isConnected ? (
        <div className="mb-6">
          {/* Header with Wallet and Toggle */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <button
              onClick={() => setIsInfoOpen(!isInfoOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-nasun-c6 border border-nasun-c5/50 rounded-lg hover:border-nasun-c4 transition-colors"
            >
              <span className="text-nasun-white font-medium">My Governance Info</span>
              <svg
                className={`w-4 h-4 text-nasun-white/70 transition-transform ${isInfoOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <WalletConnect />
          </div>

          {/* Collapsible Governance Info Panel */}
          {isInfoOpen && (
            <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <VotingPowerSummary />
                <DelegationPanel />
              </div>
              <GovernanceStats />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-nasun-c6 border border-nasun-c5/50 rounded-xl p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-nasun-white mb-1">
                {t("proposals:wallet.connect_required")}
              </h3>
              <p className="text-sm text-nasun-white/70">
                {status === "locked"
                  ? t("proposals:wallet.locked")
                  : "Connect your wallet to view your voting power and participate"
                }
              </p>
            </div>
            <WalletConnect />
          </div>
        </div>
      )}

      {/* Proposals Section */}
      <div>
        <h3 className="text-xl font-semibold text-nasun-white mb-4">
          Active Proposals
        </h3>
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
  const { t } = useTranslation("common");
  const dashboardId = useNetworkVariable("dashboardId");
  const { account } = useWallet();
  const { data: voteNftsRes, refetch: refetchNfts, error: nftsError } = useVoteNfts();

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

  // Only wait for Dashboard loading (Vote NFTs only load when wallet is connected)
  if (isDashboardPending) {
    return <SectionLoading showLayout={false} />;
  }

  // Error handling (Vote NFTs errors only when wallet is connected)
  if (dashboardError || (account && nftsError)) {
    const error = dashboardError || nftsError;
    return (
      <div className="text-red-500">
        {t("error.generic")}: {error?.message}
      </div>
    );
  }

  if (!dataResponse?.data) {
    return <div className="text-red-500">{t("error.generic")}</div>;
  }

  const voteNfts = extractVoteNfts(voteNftsRes);
  const proposalIds = getDashboardFields(dataResponse.data)?.proposals_ids || [];

  if (proposalIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-5xl mb-4">📋</div>
        <p className="text-lg text-nasun-white/70">{t("none_found", { ns: "proposals" })}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {proposalIds.map((id) => (
        <ErrorBoundary key={id} fallback={<div>{t("error.generic")}</div>}>
          <Suspense fallback={<InlineLoading size="sm" />}>
            <ProposalItem
              id={id}
              onVoteTxSuccess={() => refetchNfts()}
              voteNft={voteNfts.find((nft) => nft.proposalId === id)}
            />
          </Suspense>
        </ErrorBoundary>
      ))}
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
