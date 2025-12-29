/**
 * MyAccountPage - Bento Grid Dashboard Layout
 *
 * Redesigned My Account page with modern dashboard grid layout.
 * Features unified wallet management and compact card components.
 */

import { useTranslation } from "react-i18next";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { Suspense, useEffect, useState } from "react";
import { useAuth } from "../providers/auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { SectionLoading, PageTitle } from "../components/ui";

// Dashboard Card Components
import { ProfileHeroCard } from "../components/app/myAccount/ProfileHeroCard";
import { WalletConnectionBar } from "../components/app/myAccount/WalletConnectionBar";
import { RankHistoryCard } from "../components/app/myAccount/RankHistoryCard";
import { GovernanceCard } from "../components/app/myAccount/GovernanceCard";
import { CompactNftStatus } from "../components/app/myAccount/CompactNftStatus";
import { AssetsCard } from "../components/app/myAccount/AssetsCard";
import { DangerZoneCard } from "../components/app/myAccount/DangerZoneCard";

const MyAccountPage = () => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "error";
  } | null>(null);

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

  // Get MetaMask wallet address from user data
  const walletAddress =
    user?.provider === "MetaMask"
      ? user.walletAddress
      : user?.linkedAccounts?.metamask?.walletAddress;

  // Get Twitter username from either primary account or linked accounts
  const twitterUsername =
    user?.provider === "Twitter"
      ? user.twitterHandle
      : user?.linkedAccounts?.twitter?.twitterHandle;

  return (
    <PageLayout className="max-w-7xl mx-auto">
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
      <PageTitle>MY ACCOUNT</PageTitle>

      {/* Bento Grid Dashboard Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Profile Hero Card - Left (2 cols on lg) */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <ProfileHeroCard className="col-span-1 md:col-span-2 lg:col-span-2" />
          </Suspense>
        </ErrorBoundary>

        {/* Wallet Connection Bar - Right (1 col on lg) */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <WalletConnectionBar className="col-span-1 md:col-span-2 lg:col-span-1" />
          </Suspense>
        </ErrorBoundary>

        {/* Rank History - 2 columns on large screens */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <RankHistoryCard
              username={twitterUsername || null}
              className="col-span-1 md:col-span-2 lg:col-span-2"
            />
          </Suspense>
        </ErrorBoundary>

        {/* Governance Card - 1 column */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <GovernanceCard className="col-span-1" />
          </Suspense>
        </ErrorBoundary>

        {/* NFT Status - Full Width, Compact */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <CompactNftStatus
              walletAddress={walletAddress}
              className="col-span-1 md:col-span-2 lg:col-span-3"
            />
          </Suspense>
        </ErrorBoundary>

        {/* Assets Card - Full Width */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <AssetsCard
              walletAddress={walletAddress}
              className="col-span-1 md:col-span-2 lg:col-span-3"
            />
          </Suspense>
        </ErrorBoundary>

        {/* Danger Zone - Full Width, Compact */}
        <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
          <Suspense fallback={<SectionLoading showLayout={false} />}>
            <DangerZoneCard className="col-span-1 md:col-span-2 lg:col-span-3" />
          </Suspense>
        </ErrorBoundary>
      </div>
    </PageLayout>
  );
};

export default MyAccountPage;
