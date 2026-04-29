/**
 * HomePage
 * Main dashboard page - entry point for the app
 */

import { useWallet, useZkLogin, usePasskeyStore } from "@nasun/wallet";
import {
  QuickActions,
  HotMarketsCard,
  PredictionHighlight,
  WelcomeBanner,
  MobileAssetBar,
  MobileTokenPills,
  MobileQuickActions,
  GettingStartedCard,
} from "../features/dashboard";
import { AssetOverview, TokenBalanceList, ActivityTabs } from "../features/portfolio";

function MarketsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <HotMarketsCard />
      <PredictionHighlight />
    </div>
  );
}

export function HomePage() {
  const { status } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isPasskeyUnlocked = usePasskeyStore((s) => s.isUnlocked);
  const hasNoWallet = status === "disconnected" && !isZkLoggedIn && !isPasskeyUnlocked;

  return (
    <div className="p-4 pt-0 md:p-6 md:pt-1 max-w-7xl mx-auto">
      {/* ===== Connected or Locked State: Portfolio-Centric Layout ===== */}
      {!hasNoWallet && (
        <>
          {/* Getting Started checklist (auto-hides when all steps complete) */}
          <GettingStartedCard />

          {/* Mobile: compact asset bar + token pills + icon strip */}
          <div className="md:hidden space-y-3 mb-4">
            <MobileAssetBar />
            <MobileTokenPills />
            <MobileQuickActions />
          </div>

          {/* Desktop: full Asset Overview + Token List grid */}
          <div className="hidden md:block mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-1">
                <AssetOverview />
              </div>
              <div className="lg:col-span-2">
                <TokenBalanceList />
              </div>
            </div>
          </div>

          {/* Desktop: Quick Actions grid */}
          <div className="hidden md:block mb-6">
            <h2 className="text-lg font-bold text-theme-text-primary mb-4">
              Start here
            </h2>
            <QuickActions />
          </div>

          {/* Markets Section */}
          <MarketsGrid />

          {/* Activity (Trades & Transfers) */}
          <div className="mt-4">
            <h2 className="text-sm md:text-lg font-bold text-theme-text-primary mb-3 md:mb-4">Recent Activity</h2>
            <ActivityTabs />
          </div>
        </>
      )}

      {/* ===== No Wallet: Onboarding Layout ===== */}
      {hasNoWallet && (
        <>
          {/* Welcome Banner */}
          <div className="mb-6">
            <WelcomeBanner />
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-theme-text-primary mb-4">
              Start here
            </h2>
            <QuickActions />
          </div>

          {/* Markets Section */}
          <div className="mb-8">
            <MarketsGrid />
          </div>

          {/* Footer Tagline */}
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 text-center">
            <p className="text-sm xl:text-base text-theme-text-muted">
              Start trading. More is coming.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
