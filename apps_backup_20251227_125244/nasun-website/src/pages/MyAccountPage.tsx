import { useTranslation } from "react-i18next";
import { MyAssets } from "../components/app/myAccount/MyAssets";
import UserInfo from "../components/app/myAccount/UserInfo";
import { MyWalletStatus } from "../components/app/myAccount/MyWalletStatus";
import { PageLayout } from "../components/layout/PageLayout";
import ErrorBoundary from "../components/layout/ErrorBoundary";
import { Suspense, useEffect, useState } from "react";
import { useUserWallet } from "../hooks/wallet/useUserWallet";
import { useAuth } from "../providers/auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import { WhitelistStatus } from "../components/app/myAccount/WhitelistStatus";
import { BattalionNftAllowlistStatus } from "../components/app/myAccount/BattalionNftAllowlistStatus";
import { AccountDeletion } from "../components/app/myAccount/AccountDeletion";
import { Button } from "../components/ui/button";
import { RankHistorySection } from "../components/app/myAccount/RankHistorySection";
import { SectionLoading } from "../components/ui";

const MyAccountPage = () => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user: walletUser, isLoading, error } = useUserWallet();
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
          `${provider} 계정 연결이 취소되었습니다.`,
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

      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <UserInfo user={walletUser} isLoading={isLoading} error={error} />
        </Suspense>
      </ErrorBoundary>

      {/* Rank History Section - 항상 표시 */}
      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <RankHistorySection username={twitterUsername || null} />
        </Suspense>
      </ErrorBoundary>

      {/* Battalion NFT Allowlist Status */}
      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <BattalionNftAllowlistStatus walletAddress={walletAddress} />
        </Suspense>
      </ErrorBoundary>

      {/* Founders NFT Whitelist Status */}
      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <WhitelistStatus walletAddress={walletAddress} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <MyWalletStatus />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <MyAssets walletAddress={walletAddress} />
        </Suspense>
      </ErrorBoundary>

      {/* Account Deletion Section */}
      <ErrorBoundary fallback={<div>{t("error.generic", { ns: "common" })}</div>}>
        <Suspense fallback={<SectionLoading showLayout={false} />}>
          <AccountDeletion />
        </Suspense>
      </ErrorBoundary>
    </PageLayout>
  );
};

export default MyAccountPage;
