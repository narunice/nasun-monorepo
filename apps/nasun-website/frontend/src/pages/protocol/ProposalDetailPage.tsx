/**
 * ProposalDetailPage
 *
 * Shareable detail page for individual governance proposals.
 * Route: /network/governance/proposal/:proposalId
 */

import { FC, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import { VoteNft } from "@/features/governance/types/voting";
import { VoteModal } from "@/features/governance/components/VoteModal";
import { useProposalType } from "@/features/governance/hooks/useProposalType";
import { useVoteNfts } from "@/features/governance/hooks/useVoteNfts";
import {
  parseProposal,
  parseMultiChoiceProposal,
  isMultiChoiceProposal,
  isTwitterChoiceProposal,
  getChoiceLabel,
  extractTweetHandle,
  getChoicePercentages,
  isUnixTimeExpired,
  formatTimeRemaining,
  getStatusBadge,
  splitVoteChoices,
} from "@/features/governance/utils/proposalHelpers";
import { MultiChoiceVoteModal } from "@/features/governance/components/MultiChoiceVoteModal";
import { NftImageModal } from "@/features/governance/components/NftImageModal";
import { TweetChoiceGrid } from "@/features/governance/components/TweetChoiceGrid";
import { PageLayout } from "@/components/layout/PageLayout";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox, PageTitle, SectionLoading } from "@/components/ui";
import { toast } from "react-toastify";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { ButtonV3 } from "@/components/ui/button-v3";

const ProposalDetailPage: FC = () => {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("proposals");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // Validate proposalId before making queries
  const isValidId = proposalId && /^0x[a-fA-F0-9]{64}$/.test(proposalId);

  const {
    data: dataResponse,
    refetch: refetchProposal,
    error,
    isPending,
  } = useSuiClientQuery("getObject", {
    id: proposalId || "",
    options: { showContent: true },
  });

  const { proposalType, isLoading: isTypeLoading } = useProposalType(
    proposalId!,
  );
  const { data: voteNftsRes, refetch: refetchNfts } = useVoteNfts();

  // Find user's vote NFT for this proposal
  const voteNft = voteNftsRes?.data
    ?.map((obj) => {
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as {
        proposal_id: string;
        url: string;
        id: { id: string };
      };
      return { proposalId: fields.proposal_id, url: fields.url, id: fields.id };
    })
    .find((nft): nft is VoteNft => nft?.proposalId === proposalId);

  if (!isValidId) {
    return (
      <PageLayout className="!pt-0">
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <p className="text-red-400 mb-4">{t("detail.invalidId")}</p>
          <ButtonV3
            variant="nw2"
            outline
            onClick={() => navigate("/network/governance")}
          >
            {t("detail.backToGovernance")}
          </ButtonV3>
        </div>
      </PageLayout>
    );
  }

  if (isPending || isTypeLoading) {
    return (
      <PageLayout className="!pt-0">
        <SectionLoading fullScreen />
      </PageLayout>
    );
  }

  if (error || !dataResponse?.data) {
    return (
      <PageLayout className="!pt-0">
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <p className="text-red-400 mb-4">{t("detail.notFound")}</p>
          <ButtonV3
            variant="nw2"
            outline
            onClick={() => navigate("/network/governance")}
          >
            {t("detail.backToGovernance")}
          </ButtonV3>
        </div>
      </PageLayout>
    );
  }

  // Type discriminator: check if this is a multi-choice proposal
  const objectType =
    dataResponse.data?.content?.dataType === "moveObject"
      ? (dataResponse.data.content.type ?? "")
      : "";

  if (isMultiChoiceProposal(objectType)) {
    return (
      <MultiChoiceProposalDetail
        proposalId={proposalId!}
        data={dataResponse.data}
        proposalType={proposalType}
        refetchProposal={refetchProposal}
      />
    );
  }

  const proposal = parseProposal(dataResponse.data, proposalType);

  if (!proposal) {
    return (
      <PageLayout className="!pt-0">
        <div className="flex-1 flex items-center justify-center py-20">
          <p className="text-red-400">{t("detail.parseFailed")}</p>
        </div>
      </PageLayout>
    );
  }

  const { body: descriptionBody, choices: voteChoices } = splitVoteChoices(
    proposal.description,
  );

  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(proposal.expiration) || isDelisted;

  const yesCount = Number(proposal.yesVotes) || 0;
  const noCount = Number(proposal.noVotes) || 0;
  const totalVotes = yesCount + noCount;
  const yesPercent = totalVotes > 0 ? (yesCount / totalVotes) * 100 : 50;
  const hasPassed = yesCount > noCount;

  const statusBadge = getStatusBadge(isDelisted, isExpired, hasPassed);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(t("detail.urlCopied"));
  };

  const handleShareToX = async () => {
    if (!captureRef.current || isSharing) return;
    setIsSharing(true);

    try {
      // Dynamic import for code splitting
      const html2canvas = await import("html2canvas").then((m) => m.default);

      // Capture screenshot
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#191615", // Nasun dark background
        scale: 2, // Retina quality
        useCORS: true,
        ignoreElements: (element) => {
          return element.classList.contains("no-capture");
        },
      });

      // Convert to PNG blob
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );

      if (blob) {
        // Copy to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        toast.info(t("detail.screenshotCopied"));
      }

      // Open X post window
      const message = `Check out this governance proposal on @Nasun_io!\n\n${proposal.title}`;
      const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;
      window.open(twitterUrl, "_blank", "width=550,height=420");
    } catch (error) {
      console.error("Failed to share to X:", error);
      toast.error(t("detail.screenshotFailed"));
    } finally {
      setIsSharing(false);
    }
  };

  const explorerUrl =
    import.meta.env.VITE_DEVNET_EXPLORER_URL ||
    "https://explorer.nasun.io/devnet";

  return (
    <PageLayout className="!pt-0">
      <SectionLayout className="!max-w-6xl gap-4 !pt-24">
        {/* Top Row: Back Button (left) + Badges (right) */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/network/governance")}
            className="inline-flex items-center text-nasun-nw1 hover:text-nasun-nw4 transition-colors text-xs md:text-sm lg:text-base uppercase font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("detail.backToGovernance")}
          </button>
          <div className="flex items-center gap-2">
            {proposal.proposalType === "Poll" ? (
              <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
                {t("detail.poll")}
              </span>
            ) : (
              <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-nw4/20 text-nasun-nw4 border border-nasun-nw4/30">
                {t("detail.governance")}
              </span>
            )}
            <span
              className={`px-3 py-1 text-xs uppercase font-bold rounded-full border ${statusBadge.bg} ${statusBadge.text}`}
            >
              {statusBadge.label}
            </span>
            {voteNft && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                {t("detail.youVoted")}
              </span>
            )}
          </div>
        </div>

        {/* Capture area wrapper */}
        <div ref={captureRef} className="flex flex-col gap-4">
          {/* Title */}
          <PageTitle as="h2">{proposal.title}</PageTitle>

          {/* Vote Proof NFT banner (Yes/No proposals) */}
          {voteNft && (
            <div className="flex items-center gap-4 p-4 bg-green-500/5 border border-green-500/20 rounded-sm">
              <NftImageModal
                src={voteNft.url}
                thumbnailClassName="w-12 h-12 rounded-full border-2 border-green-500/40"
              />
              <div>
                <p className="text-green-400 font-medium text-sm">
                  You have voted on this proposal
                </p>
                <p className="text-nasun-white/40 text-xs">
                  Vote Proof NFT has been issued to your wallet
                </p>
              </div>
            </div>
          )}

          {/* Two-column layout: Description (left) + Sidebar (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            {/* Left: Description + Vote Choices */}
            <div className="flex flex-col gap-4">
              <OuterBox
                color="nw2"
                padding="md"
                className="flex flex-col min-h-[300px] lg:min-h-[500px] max-h-[55vh] !bg-gray-900"
              >
                <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                  <p className="text-nasun-white/90 whitespace-pre-wrap leading-relaxed">
                    {descriptionBody}
                  </p>
                </div>
              </OuterBox>

              {voteChoices.length > 0 && (
                <div className="space-y-2">
                  {voteChoices.map((choice, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-4 rounded-lg border border-nasun-white/10 bg-nasun-white/[0.04]"
                    >
                      <span
                        className={`px-2.5 py-1 text-xs font-bold rounded uppercase flex-shrink-0 ${
                          choice.label === "YES"
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                        }`}
                      >
                        {choice.label}
                      </span>
                      <span className="text-nasun-white/90 text-sm leading-relaxed">
                        {choice.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Sidebar */}
            <div className="flex flex-col gap-4 lg:min-h-[300px]">
              {/* Vote Results */}
              <OuterBox color="nw1" padding="md">
                <h3 className="text-base font-medium text-nasun-white/90 uppercase tracking-wider mb-3">
                  {t("detail.voteResults")}
                </h3>
                <div className="mb-3">
                  <div
                    className={`w-full h-3 rounded-full overflow-hidden ${isExpired ? "bg-red-500/15" : "bg-red-500/30"}`}
                  >
                    <div
                      className={`h-full transition-all ${isExpired ? "bg-green-500/60" : "bg-green-500"}`}
                      style={{ width: `${yesPercent}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-sm p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {yesPercent.toFixed(1)}%
                    </div>
                    <div className="text-sm text-nasun-white/70">
                      {t("detail.yes")}
                    </div>
                    <div className="text-base font-medium text-green-400 mt-1">
                      {proposal.yesVotes}
                    </div>
                    <div className="text-xs text-nasun-white/30">
                      {t("detail.votingPower")}
                    </div>
                  </div>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-sm p-3 text-center">
                    <div className="text-2xl font-bold text-red-400">
                      {(100 - yesPercent).toFixed(1)}%
                    </div>
                    <div className="text-sm text-nasun-white/70">
                      {t("detail.no")}
                    </div>
                    <div className="text-base font-medium text-red-400 mt-1">
                      {proposal.noVotes}
                    </div>
                    <div className="text-xs text-nasun-white/30">
                      {t("detail.votingPower")}
                    </div>
                  </div>
                </div>
              </OuterBox>

              {/* Details */}
              <OuterBox color="nw1" padding="md" className="flex-1">
                <h3 className="text-base font-medium text-nasun-white/90 uppercase tracking-wider mb-3">
                  {t("detail.details")}
                </h3>
                <div className="space-y-2 text-base">
                  <div className="flex justify-between">
                    <span className="text-nasun-white/70">
                      {t("detail.proposalId")}
                    </span>
                    <a
                      href={`${explorerUrl}/object/${proposalId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-nasun-nw1 hover:text-nasun-nw2 flex items-center gap-1 font-mono text-sm"
                    >
                      {proposalId?.slice(0, 6)}...{proposalId?.slice(-4)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-nasun-white/70">
                      {t("detail.creator")}
                    </span>
                    <a
                      href={`${explorerUrl}/address/${proposal.creator}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-nasun-nw1 hover:text-nasun-nw2 flex items-center gap-1 font-mono text-sm"
                    >
                      {proposal.creator.slice(0, 6)}...
                      {proposal.creator.slice(-4)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-nasun-white/70">
                      {t("detail.expiration")}
                    </span>
                    <span className="text-nasun-white/80 text-sm">
                      {isDelisted
                        ? t("detail.delisted")
                        : isExpired
                          ? `${t("detail.ended")} ${new Date(proposal.expiration).toLocaleString("en-US")}`
                          : formatTimeRemaining(proposal.expiration)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-nasun-white/70">
                      {t("detail.type")}
                    </span>
                    <span className="text-nasun-white/80 text-sm">
                      {proposal.proposalType === "Poll"
                        ? t("detail.pollType")
                        : t("detail.governanceType")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-nasun-white/70">Total Voters</span>
                    <span className="text-nasun-white/80 text-sm">
                      {proposal.yesCount + proposal.noCount}
                    </span>
                  </div>
                </div>
              </OuterBox>

              {/* Actions - excluded from screenshot capture */}
              <div className="flex flex-col gap-2 no-capture">
                {/* Copy URL Button */}
                <ButtonV3
                  variant="nw2"
                  outline
                  onClick={handleCopyUrl}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  {t("detail.copyUrl")}
                </ButtonV3>

                {/* Share on X Button */}
                <ButtonV3
                  variant="nw2"
                  outline
                  onClick={handleShareToX}
                  disabled={isSharing}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  {isSharing ? t("detail.capturing") : t("detail.shareOnX")}
                </ButtonV3>

                {/* Vote Button */}
                {!isExpired && (
                  <ButtonV3
                    variant="gradientDark"
                    onClick={() => setIsModalOpen(true)}
                    disabled={!!voteNft}
                    className="w-full"
                  >
                    {voteNft
                      ? t("detail.alreadyVoted")
                      : t("detail.voteOnProposal")}
                  </ButtonV3>
                )}
              </div>
            </div>
          </div>
        </div>

        <VoteModal
          proposal={proposal}
          hasVoted={!!voteNft}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onVote={async () => {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            await refetchProposal();
            for (let i = 0; i < 5; i++) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              await refetchNfts();
            }
            setIsModalOpen(false);
          }}
        />
      </SectionLayout>
    </PageLayout>
  );
};

export default ProposalDetailPage;

// Multi-choice proposal detail view (separate from existing Yes/No view)
import { SuiObjectData } from "@mysten/sui/client";
import { ProposalType } from "@/features/governance/types/voting";
import { useTwitterDisplayNames } from "@/features/governance/hooks/useTwitterDisplayNames";
import { useMultiChoiceVoteNfts } from "@/features/governance/hooks/useMultiChoiceVoteNfts";

const CHOICE_COLORS = [
  "bg-nasun-nw1",
  "bg-nasun-nw4",
  "bg-green-500",
  "bg-blue-500",
  "bg-purple-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-cyan-500",
];

const MultiChoiceProposalDetail: FC<{
  proposalId: string;
  data: SuiObjectData;
  proposalType: ProposalType;
  refetchProposal: () => Promise<unknown>;
}> = ({ proposalId, data, proposalType, refetchProposal }) => {
  const navigate = useNavigate();
  const { t } = useTranslation("proposals");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [localVoted, setLocalVoted] = useState(false);

  // Query MultiChoiceVoteProofNFT to detect if user already voted
  const { data: mcNftsRes, refetch: refetchMcNfts } = useMultiChoiceVoteNfts();
  const voteNft = mcNftsRes?.data
    ?.map((obj) => {
      if (obj.data?.content?.dataType !== "moveObject") return null;
      const fields = obj.data.content.fields as {
        proposal_id: string;
        url: string;
      };
      return { proposalId: fields.proposal_id, url: fields.url };
    })
    .find((nft) => nft?.proposalId === proposalId);
  const hasVoted = localVoted || !!voteNft;

  const proposal = parseMultiChoiceProposal(data, proposalType);
  const { displayNames } = useTwitterDisplayNames(proposal?.choices ?? []);

  if (!proposal) {
    return (
      <PageLayout className="!pt-0">
        <div className="flex-1 flex items-center justify-center py-20">
          <p className="text-red-400">{t("detail.parseFailed")}</p>
        </div>
      </PageLayout>
    );
  }

  const isDelisted = proposal.status.variant === "Delisted";
  const isExpired = isUnixTimeExpired(proposal.expiration) || isDelisted;
  const isTweetMode = isTwitterChoiceProposal(proposal.choices);
  const percentages = getChoicePercentages(proposal.choicePowers);
  const totalPower = proposal.choicePowers.reduce((sum, p) => sum + p, 0);
  const totalVoters = proposal.choiceCounts.reduce((sum, c) => sum + c, 0);
  const maxPower = Math.max(...proposal.choicePowers);
  const statusBadge = getStatusBadge(isDelisted, isExpired, maxPower > 0);

  const explorerUrl =
    import.meta.env.VITE_DEVNET_EXPLORER_URL ||
    "https://explorer.nasun.io/devnet";

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(t("detail.urlCopied"));
  };

  return (
    <PageLayout className="!pt-0">
      <SectionLayout className="!max-w-6xl gap-4 !pt-24">
        {/* Top Row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/network/governance")}
            className="inline-flex items-center text-nasun-nw1 hover:text-nasun-nw4 transition-colors text-xs md:text-sm lg:text-base uppercase font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("detail.backToGovernance")}
          </button>
          <div className="flex items-center gap-2">
            {proposal.proposalType === "Poll" ? (
              <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-nw1/20 text-nasun-nw1 border border-nasun-nw1/30">
                {t("detail.poll")}
              </span>
            ) : (
              <span className="px-3 py-1 text-xs uppercase font-bold rounded-full bg-nasun-nw4/20 text-nasun-nw4 border border-nasun-nw4/30">
                {t("detail.governance")}
              </span>
            )}
            <span
              className={`px-3 py-1 text-xs uppercase font-bold rounded-full border ${statusBadge.bg} ${statusBadge.text}`}
            >
              {statusBadge.label}
            </span>
          </div>
        </div>

        {/* Title */}
        <PageTitle as="h2">{proposal.title}</PageTitle>

        {/* Vote Proof NFT banner */}
        {hasVoted && voteNft && (
          <div className="flex items-center gap-4 p-4 mb-4 bg-green-500/5 border border-green-500/20 rounded-sm">
            <NftImageModal
              src={voteNft.url}
              thumbnailClassName="w-12 h-12 rounded-full border-2 border-green-500/40"
            />
            <div>
              <p className="text-green-400 font-medium text-sm">
                You have voted on this proposal
              </p>
              <p className="text-nasun-white/40 text-xs">
                Vote Proof NFT has been issued to your wallet
              </p>
            </div>
          </div>
        )}

        {/* Tweet Choice Grid (full width, above description) */}
        {isTweetMode && (
          <div className="mb-6">
            <TweetChoiceGrid
              choices={proposal.choices}
              selectedChoice={selectedChoice}
              onSelect={(idx) =>
                setSelectedChoice((prev) => (prev === idx ? null : idx))
              }
              disabled={isExpired || hasVoted}
              displayNames={displayNames}
            />
          </div>
        )}

        {/* Description */}
        <OuterBox color="nw2" padding="md" className="!bg-gray-900 mb-4">
          <p className="text-nasun-white/90 whitespace-pre-wrap leading-relaxed">
            {proposal.description}
          </p>
        </OuterBox>

        {/* Vote Results + Details (side by side on desktop) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Vote Results */}
          <OuterBox color="nw1" padding="md">
            <h3 className="text-base font-medium text-nasun-white/90 uppercase tracking-wider mb-3">
              {t("detail.voteResults")}
            </h3>
            <div className="space-y-3">
              {proposal.choices.map((choice, idx) => {
                const handle = extractTweetHandle(choice);
                const displayName = handle ? displayNames?.get(handle.toLowerCase()) : null;
                const choiceLabel = getChoiceLabel(choice, displayNames);
                return (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-nasun-white/80 truncate mr-2">
                        {displayName ? (
                          <>
                            <span className="font-medium">{displayName}</span>
                            <span className="text-nasun-white/40 ml-1.5">@{handle}</span>
                          </>
                        ) : choiceLabel}
                      </span>
                      <span className="text-nasun-white/50 flex-shrink-0">
                        {percentages[idx]}%
                        {totalPower > 0
                          ? ` (${proposal.choicePowers[idx]})`
                          : ""}
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full overflow-hidden bg-nasun-white/10">
                      <div
                        className={`h-full transition-all ${CHOICE_COLORS[idx % CHOICE_COLORS.length]}`}
                        style={{ width: `${percentages[idx]}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-nasun-white/10 flex justify-between text-sm text-nasun-white/50">
              <span>Total Voters: {totalVoters}</span>
              <span>Total Power: {totalPower}</span>
            </div>
            {proposal.useEqualWeight && (
              <p className="text-xs text-nasun-white/30 mt-2">
                Equal Weight: 1 vote per wallet
              </p>
            )}
          </OuterBox>

          {/* Details + Actions */}
          <OuterBox color="nw1" padding="md">
            <h3 className="text-base font-medium text-nasun-white/90 uppercase tracking-wider mb-3">
              {t("detail.details")}
            </h3>
            <div className="space-y-2 text-base">
              <div className="flex justify-between">
                <span className="text-nasun-white/70">
                  {t("detail.proposalId")}
                </span>
                <a
                  href={`${explorerUrl}/object/${proposalId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-nw1 hover:text-nasun-nw2 flex items-center gap-1 font-mono text-sm"
                >
                  {proposalId.slice(0, 6)}...{proposalId.slice(-4)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-nasun-white/70">
                  {t("detail.creator")}
                </span>
                <a
                  href={`${explorerUrl}/address/${proposal.creator}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-nw1 hover:text-nasun-nw2 flex items-center gap-1 font-mono text-sm"
                >
                  {proposal.creator.slice(0, 6)}...{proposal.creator.slice(-4)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex justify-between">
                <span className="text-nasun-white/70">
                  {t("detail.expiration")}
                </span>
                <span className="text-nasun-white/80 text-sm">
                  {isDelisted
                    ? t("detail.delisted")
                    : isExpired
                      ? `${t("detail.ended")} ${new Date(proposal.expiration).toLocaleString("en-US")}`
                      : formatTimeRemaining(proposal.expiration)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-nasun-white/70">Total Voters</span>
                <span className="text-nasun-white/80 text-sm">
                  {totalVoters}
                </span>
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-nasun-white/10">
              <ButtonV3
                variant="nw2"
                outline
                onClick={handleCopyUrl}
                className="w-full flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                {t("detail.copyUrl")}
              </ButtonV3>
              {!isExpired && !isTweetMode && (
                <ButtonV3
                  variant="gradientDark"
                  onClick={() => setIsModalOpen(true)}
                  className="w-full"
                >
                  Vote
                </ButtonV3>
              )}
            </div>
          </OuterBox>
        </div>

        {/* Sticky bottom bar for tweet mode voting */}
        {isTweetMode && !isExpired && !hasVoted && (
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-nasun-c7 shadow-[0_-4px_24px_rgba(179,224,255,0.4)]">
            <div className="max-w-6xl mx-auto flex items-center justify-center gap-6 px-4 py-4">
              <span
                className={`text-lg font-semibold truncate text-nasun-black`}
              >
                {selectedChoice !== null
                  ? `Selected: ${getChoiceLabel(proposal.choices[selectedChoice], displayNames)}`
                  : "Select a post to vote"}
              </span>
              <button
                onClick={() => setIsModalOpen(true)}
                disabled={selectedChoice === null}
                className="flex-shrink-0 px-14 py-2 text-lg font-bold uppercase tracking-wider rounded-lg border border-nasun-nw3 bg-nasun-white text-nasun-black hover:bg-nasun-nw5 transition-all active:scale-[0.97] disabled:bg-nasun-white disabled:text-nasun-black/70 disabled:border-nasun-nw3/50 disabled:cursor-not-allowed"
              >
                Vote
              </button>
            </div>
          </div>
        )}

        <MultiChoiceVoteModal
          proposal={proposal}
          hasVoted={hasVoted}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialChoice={selectedChoice ?? undefined}
          onVote={async () => {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            await refetchProposal();
            setLocalVoted(true);
            // Refetch NFTs to show vote proof
            for (let i = 0; i < 5; i++) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              await refetchMcNfts();
            }
            setIsModalOpen(false);
          }}
        />

        {/* Bottom padding for sticky bar */}
        {isTweetMode && selectedChoice !== null && !isExpired && !hasVoted && (
          <div className="h-16" />
        )}
      </SectionLayout>
    </PageLayout>
  );
};
