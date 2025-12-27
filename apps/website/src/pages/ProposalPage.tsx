import { useSuiClientQuery, useCurrentAccount } from "@mysten/dapp-kit";
import { useNetworkVariable } from "../config/suiNetworkConfig";
import { PaginatedObjectsResponse, SuiObjectData } from "@mysten/sui/client";
import { ProposalItem } from "../components/app/web3/proposal/ProposalItem";
import { useVoteNfts } from "../hooks/votingSystem/useVoteNfts";
import { VoteNft } from "../types/voting";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { SectionLoading, InlineLoading } from "../components/ui";
import { PageTitle } from "../components/ui/PageTitle";

// The main view logic, responsible for fetching and displaying proposals
const ProposalView = () => {
  const { t } = useTranslation("common");
  const dashboardId = useNetworkVariable("dashboardId");
  const account = useCurrentAccount();
  const {
    data: voteNftsRes,
    refetch: refetchNfts,
    error: nftsError,
  } = useVoteNfts();

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

  // Dashboard 로딩만 기다림 (Vote NFTs는 지갑 연결 시에만 로딩)
  if (isDashboardPending) {
    return <SectionLoading showLayout={false} />;
  }

  // 에러 처리 (Vote NFTs 에러는 지갑 연결 시에만)
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

  return (
    <div className="w-full px-10">
      {proposalIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-6xl mb-4">📋</div>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {t("none_found", { ns: "proposals" })}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
      )}
    </div>
  );
};

// The page wrapper, providing layout and top-level boundaries
export default function ProposalPage() {
  const { t } = useTranslation(["proposals", "common"]);

  return (
    <PageLayout>
      <PageTitle as="h2" align="center">
        {t("proposals:title")}
      </PageTitle>

      <ErrorBoundary fallback={<div>{t("common:error.generic")}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <ProposalView />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
}

// Helper functions remain the same
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
