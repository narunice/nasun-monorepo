/**
 * DevMyAccountPage - Dev version of My Account for testing new features.
 *
 * Differences from production MyAccountPage:
 * - Uses CompactNftStatus with showAllSections (Alliance, Battalion, Frontiers enabled)
 * - ProfileHeroCard redesigned: points-centric hero, no Connected Accounts inline
 * - PointsCard removed (absorbed into ProfileHeroCard)
 * - ConnectedAccountsCard at page bottom (extracted from ProfileHeroCard)
 * - DailyMissionsCard and ReferralCard visible
 * - Title shows "MY ACCOUNT (DEV)"
 *
 * Route: /dev/my-account
 */

import { useTranslation } from "react-i18next";
import { PageLayout } from "../../components/layout/PageLayout";
import { SectionLayout } from "../../components/layout/SectionLayout";
import ErrorBoundary from "../../components/layout/ErrorBoundary";
import { Suspense, useEffect, useState } from "react";
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

// Dashboard Card Components
import { ProfileHeroCard } from "../../sections/myAccount/ProfileHeroCard";
import { GovernanceCard } from "../../sections/myAccount/GovernanceCard";
import { CompactNftStatus } from "../../sections/myAccount/CompactNftStatus";
import { AssetsCard } from "../../sections/myAccount/AssetsCard";
import { DangerZoneCard } from "../../sections/myAccount/DangerZoneCard";
import { RankHistoryCard } from "../../sections/myAccount/RankHistoryCard";
import { ReferralCard } from "../../sections/myAccount/ReferralCard";
import { DailyMissionsCard } from "../../sections/myAccount/DailyMissionsCard";
import { ConnectedAccountsCard } from "../../sections/myAccount/ConnectedAccountsCard";
import { EcosystemStatusCard } from "../../sections/myAccount/EcosystemStatusCard";

const DevMyAccountPage = () => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "error";
  } | null>(null);
  const [showLinkXGuidance, setShowLinkXGuidance] = useState(false);
  const { handleLinkTwitter } = useAccountLinking({ user });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    // Check for account linking cancellation message
    const message = searchParams.get("message");
    const provider = searchParams.get("provider");

    if (message === "account_linking_cancelled" && provider) {
      setNotification({
        message:
          t("userInfo.accountLinkingCancelled", { provider }) ||
          `${provider} account linking was cancelled.`,
        type: "info",
      });

      // Clear URL parameters
      setSearchParams({});

      // Auto-hide notification after 5 seconds
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams, t]);

  // Show X account linking guidance modal when arriving from leaderboard-guide
  useEffect(() => {
    if (searchParams.get("guidance") === "link-x") {
      setShowLinkXGuidance(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Prefer linked MetaMask wallet over login wallet
  const walletAddress =
    user?.linkedAccounts?.metamask?.walletAddress
      || (user?.provider === "MetaMask" ? user.walletAddress : undefined);

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
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
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
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
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
        <PageTitle>MY ACCOUNT (DEV)</PageTitle>

        {/* Bento Grid Dashboard Layout */}
        {/* Row-by-row sequential layout (no row-span) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Row 1: ProfileHeroCard(2col) + CompactNftStatus(1col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <ProfileHeroCard showPoints className="order-1 lg:order-none col-span-1 md:col-span-2 lg:col-span-2" />
            </Suspense>
          </ErrorBoundary>

          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <CompactNftStatus showAllSections className="order-2 lg:order-none col-span-1" />
            </Suspense>
          </ErrorBoundary>

          {/* Row 2: EcosystemStatusCard(3col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <EcosystemStatusCard className="order-3 lg:order-none col-span-1 md:col-span-2 lg:col-span-3" />
            </Suspense>
          </ErrorBoundary>

          {/* Row 3: DailyMissionsCard(2col) + ReferralCard(1col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <DailyMissionsCard className="order-5 lg:order-none col-span-1 md:col-span-2 lg:col-span-2" />
            </Suspense>
          </ErrorBoundary>

          {/* <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <ReferralCard className="order-6 lg:order-none col-span-1" />
            </Suspense>
          </ErrorBoundary> */}

          {/* Row 4: RankHistoryCard(2col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <RankHistoryCard className="order-7 lg:order-none col-span-1 md:col-span-2 lg:col-span-2" />
            </Suspense>
          </ErrorBoundary>

          {/* Row 5: ConnectedAccountsCard(2col) + GovernanceCard(1col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <ConnectedAccountsCard className="order-8 lg:order-none col-span-1 md:col-span-2 lg:col-span-2 relative z-20" />
            </Suspense>
          </ErrorBoundary>

          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <GovernanceCard className="order-9 lg:order-none col-span-1" />
            </Suspense>
          </ErrorBoundary>

          {/* Row 6: AssetsCard(2col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <AssetsCard walletAddress={walletAddress} className="order-10 lg:order-none col-span-1 md:col-span-2 lg:col-span-2" />
            </Suspense>
          </ErrorBoundary>

          {/* Row 7: DangerZoneCard(3col) */}
          <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
            <Suspense fallback={<SectionLoading showLayout={false} />}>
              <DangerZoneCard className="order-11 lg:order-none col-span-1 md:col-span-2 lg:col-span-3" />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* X Account Linking Guidance Modal */}
        <Dialog modal={false} open={showLinkXGuidance} onOpenChange={setShowLinkXGuidance}>
          <DialogContent className="max-w-md text-center" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
            <DialogHeader className="items-center">
              <FontAwesomeIcon icon={faXTwitter} className="w-10 h-10 text-nasun-white mb-2" />
              <DialogTitle>Connect Your X Account</DialogTitle>
              <DialogDescription className="text-nasun-white/70">
                To participate in the Nasun Leaderboard, connect your X account below.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <ButtonV3
                variant="nw2"
                size="sm"
                onClick={() => {
                  setShowLinkXGuidance(false);
                  localStorage.setItem("auth_return_to", "/wave1/leaderboard-guide?x_linked=1");
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
