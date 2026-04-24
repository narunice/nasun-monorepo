/**
 * MyAccountPage (V2) - Renewed My Account page.
 *
 * - ProfileHeroCard: points-centric hero, no Connected Accounts inline
 * - NftShowcaseCard replacing PointsCard + CompactNftStatus
 * - ConnectedAccountsCard at page bottom (extracted from ProfileHeroCard)
 * - DailyMissionsCard and ReferralCard visible
 *
 * Route: /my-account
 */

import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { ButtonV3 } from "@/components/ui/button-v3";
import { SectionLoading, PageTitle } from "../../components/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { useAccountLinking } from "@/sections/myAccount/hooks/useAccountLinking";
import { linkAccounts } from "@/features/auth/utils/authApi";

// Dashboard Card Components
import { ProfileHeroCard } from "../../sections/myAccount/ProfileHeroCard";
import { GovernanceCard } from "../../sections/myAccount/GovernanceCard";
import { BugReportsCard } from "../../sections/myAccount/BugReportsCard";
import { CreatorPostsCard } from "../../sections/myAccount/CreatorPostsCard";
import { CompactNftStatus } from "../../sections/myAccount/CompactNftStatus";
import { AssetsCard } from "../../sections/myAccount/AssetsCard";
import { DangerZoneCard } from "../../sections/myAccount/DangerZoneCard";
import { RankHistoryCard } from "../../sections/myAccount/RankHistoryCard";
import { EcosystemPointsCard } from "../../sections/myAccount/EcosystemPointsCard";
import { ReferralCard } from "../../sections/myAccount/ReferralCard";

import { ConnectedAccountsCard } from "../../sections/myAccount/ConnectedAccountsCard";
import { NftShowcaseCard } from "../../sections/myAccount/NftShowcaseCard";
import { CreatorRewardCard } from "../../sections/myAccount/CreatorRewardCard";
// import { GenesisDropCard } from "../../sections/myAccount/GenesisDropCard";
// import { EcosystemStatusCard } from "../../sections/myAccount/EcosystemStatusCard";

const DevMyAccountPage = () => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "error";
  } | null>(null);
  const [showLinkXGuidance, setShowLinkXGuidance] = useState(false);
  const [linkTransferConfirm, setLinkTransferConfirm] = useState<{
    provider: "Google" | "Twitter";
    primaryIdentityId: string;
    secondaryIdentityId: string;
    secondaryInfo: {
      username: string;
      email?: string;
      twitterHandle?: string;
      originalTwitterHandle?: string;
      twitterId?: string;
      profileImageUrl?: string;
    };
    existingPrimary: { walletAddress: string | null; username: string | null };
    secondaryEmail?: string;
  } | null>(null);
  const [transferring, setTransferring] = useState(false);
  const { handleLinkTwitter } = useAccountLinking({ user });

  const paramsHandled = useRef(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Handle URL search params once on mount (not reactively to avoid re-render loops)
  useEffect(() => {
    if (paramsHandled.current) return;

    const message = searchParams.get("message");
    const errorParam = searchParams.get("error");
    const provider = searchParams.get("provider");
    const guidance = searchParams.get("guidance");

    if (message === "account_linking_cancelled" && provider) {
      paramsHandled.current = true;
      setNotification({
        message:
          t("userInfo.accountLinkingCancelled", { provider }) ||
          `${provider} account linking was cancelled.`,
        type: "info",
      });
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }

    if (errorParam === "linking_failed" && provider) {
      paramsHandled.current = true;
      // Prefer the backend-supplied reason (stashed by AuthProvider in
      // sessionStorage just before the hard redirect). Fall back to a generic
      // line if sessionStorage was blocked or the payload is stale/malformed.
      let detail = "";
      try {
        const raw = sessionStorage.getItem("account_linking_error");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            parsed?.provider === provider
            && typeof parsed.message === "string"
            && typeof parsed.at === "number"
            && Date.now() - parsed.at < 60_000
          ) {
            detail = parsed.message;
          }
          sessionStorage.removeItem("account_linking_error");
        }
      } catch {
        sessionStorage.removeItem("account_linking_error");
      }
      setNotification({
        message: detail
          ? `${provider} linking failed: ${detail} Your existing sign-in is still active.`
          : `${provider} account linking failed. Your existing sign-in is still active. Please try again later or contact support.`,
        type: "error",
      });
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => setNotification(null), 12000);
      return () => clearTimeout(timer);
    }

    const confirmParam = searchParams.get("confirm");
    if (confirmParam === "link_transfer" && provider) {
      paramsHandled.current = true;
      try {
        const raw = sessionStorage.getItem("account_link_confirm_pending");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            (parsed?.provider === "Google" || parsed?.provider === "Twitter")
            && parsed.provider === provider
            && typeof parsed.primaryIdentityId === "string"
            && typeof parsed.secondaryIdentityId === "string"
            && parsed.existingPrimary
            && typeof parsed.at === "number"
            && Date.now() - parsed.at < 600_000
          ) {
            setLinkTransferConfirm({
              provider: parsed.provider,
              primaryIdentityId: parsed.primaryIdentityId,
              secondaryIdentityId: parsed.secondaryIdentityId,
              secondaryInfo: parsed.secondaryInfo || { username: "" },
              existingPrimary: parsed.existingPrimary,
              secondaryEmail: parsed.secondaryInfo?.email,
            });
          } else {
            sessionStorage.removeItem("account_link_confirm_pending");
          }
        }
      } catch {
        sessionStorage.removeItem("account_link_confirm_pending");
      }
      setSearchParams({}, { replace: true });
      return;
    }

    if (errorParam === "linking_session_expired") {
      paramsHandled.current = true;
      setNotification({
        message: "Account linking session expired. Please try linking again.",
        type: "error",
      });
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => setNotification(null), 7000);
      return () => clearTimeout(timer);
    }

    if (guidance === "link-x") {
      paramsHandled.current = true;
      setShowLinkXGuidance(true);
      setSearchParams({}, { replace: true });
    }

    const scroll = searchParams.get("scroll");
    if (scroll === "creator-posts") {
      paramsHandled.current = true;
      setSearchParams({}, { replace: true });
      setTimeout(() => {
        document
          .getElementById("creator-posts")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmTransfer = async () => {
    if (!linkTransferConfirm || !user?.cognitoToken) return;
    setTransferring(true);
    try {
      await linkAccounts(
        linkTransferConfirm.primaryIdentityId,
        linkTransferConfirm.secondaryIdentityId,
        linkTransferConfirm.provider,
        user.cognitoToken,
        linkTransferConfirm.secondaryInfo,
        { confirmTransfer: true },
      );
      sessionStorage.removeItem("account_link_confirm_pending");
      setLinkTransferConfirm(null);
      // Hard reload so the user sees the freshly linked account everywhere
      // (linkedAccounts in profile, governance, leaderboard, etc.).
      window.location.assign("/my-account");
    } catch (err) {
      setTransferring(false);
      sessionStorage.removeItem("account_link_confirm_pending");
      setLinkTransferConfirm(null);
      setNotification({
        message: err instanceof Error ? err.message : "Failed to move account.",
        type: "error",
      });
    }
  };

  const handleCancelTransfer = () => {
    if (transferring) return;
    sessionStorage.removeItem("account_link_confirm_pending");
    setLinkTransferConfirm(null);
  };

  const formatWalletShort = (addr: string | null) => {
    if (!addr) return null;
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Prefer linked MetaMask wallet over login wallet
  const walletAddress =
    user?.linkedAccounts?.metamask?.walletAddress ||
    (user?.provider === "MetaMask" ? user.walletAddress : undefined);

  return (
    <PageLayout>
      <SectionLayout className="!max-w-7xl">
        {/* Notification Banner */}
        {notification && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              notification.type === "info"
                ? "bg-nasun-c4/30 text-nasun-c3 border border-nasun-c4/50"
                : "bg-red-900 text-red-200 border border-red-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{notification.message}</span>
              </div>
              <Button
                onClick={() => setNotification(null)}
                variant="ghost"
                size="icon"
                className="ml-4"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>
            </div>
          </div>
        )}

        {/* Page Title */}
        <div className="mt-16 sm:mt-8 mb-6 md:mb-8">
          <PageTitle wrapperClassName="">ACCOUNT</PageTitle>
        </div>

        {/* Bento Grid Dashboard Layout */}
        {/* Row-by-row sequential layout (no row-span) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Left column: ProfileHeroCard(2col) + RankHistoryCard(2col) */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <ProfileHeroCard
                showPoints
                className="order-1 lg:order-none col-span-1 md:col-span-2 lg:col-span-2 relative z-20"
              />
            </Suspense>
          </ErrorBoundary>

          {/* Right column row 1: NftShowcaseCard (1 row only, so Governance can sit right of EcoPoints) */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <NftShowcaseCard className="order-2 lg:order-none col-span-1" />
            </Suspense>
          </ErrorBoundary>

          {/* Row 2: Ecosystem Points(2col) + Governance(1col) */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <EcosystemPointsCard className="order-3 lg:order-none col-span-1 md:col-span-2 lg:col-span-2" />
            </Suspense>
          </ErrorBoundary>

          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <GovernanceCard className="order-4 lg:order-none col-span-1" />
            </Suspense>
          </ErrorBoundary>

          {/* Creator Posts — above MY ASSETS */}
          <div
            id="creator-posts"
            className="order-5 lg:order-none col-span-1 md:col-span-2 lg:col-span-3"
          >
            <CreatorPostsCard />
          </div>

          {/* Creators Leaderboard History — below Creator Posts */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <RankHistoryCard className="order-6 lg:order-none col-span-1 md:col-span-2 lg:col-span-3" />
            </Suspense>
          </ErrorBoundary>

          {/* AssetsCard (full width) */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <AssetsCard
                walletAddress={walletAddress}
                className="order-7 lg:order-none col-span-1 md:col-span-2 lg:col-span-3"
              />
            </Suspense>
          </ErrorBoundary>

          {/* ConnectedAccounts(2col) + BugReports(1col) */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <ConnectedAccountsCard className="order-8 lg:order-none col-span-1 md:col-span-2 lg:col-span-2 relative z-20" />
            </Suspense>
          </ErrorBoundary>

          <BugReportsCard className="order-9 lg:order-none col-span-1" />

          {/* DangerZone (full width) */}
          <ErrorBoundary
            fallback={<div>{t("error.generic", { ns: "common" })}</div>}
          >
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <DangerZoneCard className="order-11 lg:order-none col-span-1 md:col-span-2 lg:col-span-3" />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Link-Transfer Confirm Modal: the secondary provider is already
            linked to another wallet — ask the user before moving it here. */}
        <Dialog
          modal={false}
          open={!!linkTransferConfirm}
          onOpenChange={(open) => {
            if (!open) handleCancelTransfer();
          }}
        >
          <DialogContent
            className="max-w-md text-center"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              if (transferring) e.preventDefault();
            }}
          >
            <DialogHeader className="items-center">
              <DialogTitle>
                Move {linkTransferConfirm?.provider} Account?
              </DialogTitle>
              <DialogDescription className="text-nasun-white/70 space-y-2">
                <div>
                  This {linkTransferConfirm?.provider} account
                  {linkTransferConfirm?.secondaryEmail ? ` (${linkTransferConfirm.secondaryEmail})` : ""}
                  {" "}is already linked to another wallet
                  {linkTransferConfirm?.existingPrimary.walletAddress
                    ? ` (${formatWalletShort(linkTransferConfirm.existingPrimary.walletAddress)}${
                        linkTransferConfirm.existingPrimary.username
                          ? ` — ${linkTransferConfirm.existingPrimary.username}`
                          : ""
                      })`
                    : ""}
                  .
                </div>
                <div>
                  Move it to your current wallet? The previous link will be removed.
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <ButtonV3
                variant="nw2"
                size="sm"
                onClick={handleConfirmTransfer}
                disabled={transferring}
              >
                {transferring ? "Moving..." : "Move to This Wallet"}
              </ButtonV3>
              <ButtonV3
                variant="nw2"
                size="sm"
                outline
                onClick={handleCancelTransfer}
                disabled={transferring}
              >
                Cancel
              </ButtonV3>
            </div>
          </DialogContent>
        </Dialog>

        {/* X Account Linking Guidance Modal */}
        <Dialog
          modal={false}
          open={showLinkXGuidance}
          onOpenChange={setShowLinkXGuidance}
        >
          <DialogContent
            className="max-w-md text-center"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader className="items-center">
              <FontAwesomeIcon
                icon={faXTwitter}
                className="w-10 h-10 text-nasun-white mb-2"
              />
              <DialogTitle>Connect Your X Account</DialogTitle>
              <DialogDescription className="text-nasun-white/70">
                To participate in the Creators Leaderboard, connect your X
                account below.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <ButtonV3
                variant="nw2"
                size="sm"
                onClick={() => {
                  setShowLinkXGuidance(false);
                  localStorage.setItem(
                    "auth_return_to",
                    "/community/creators-leaderboard-guide?x_linked=1",
                  );
                  handleLinkTwitter();
                }}
              >
                Connect X Account
              </ButtonV3>
              <ButtonV3
                variant="nw2"
                size="sm"
                outline
                onClick={() => setShowLinkXGuidance(false)}
              >
                Later
              </ButtonV3>
            </div>
          </DialogContent>
        </Dialog>
      </SectionLayout>
    </PageLayout>
  );
};

export default DevMyAccountPage;
