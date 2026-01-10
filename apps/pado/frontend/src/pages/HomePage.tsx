/**
 * HomePage
 * Main dashboard page - entry point for the app
 *
 * Portfolio-Centric Layout (when connected):
 * - AssetOverview (total value + 24h change)
 * - TokenBalanceList (NASUN, NBTC, NUSDC)
 * - QuickActions grid
 * - ActivityTabs (Trades | Transfers)
 * - Hot Markets + Prediction Highlight (compact)
 *
 * Onboarding Layout (when not connected):
 * - Welcome Banner
 * - QuickActions + Hot Markets + Predictions
 */

import { useState, useEffect } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import {
  QuickActions,
  HotMarketsCard,
  PredictionHighlight,
  WelcomeBanner,
} from "../features/dashboard";
import { AssetOverview, TokenBalanceList, ActivityTabs } from "../features/portfolio";

export function HomePage() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = isZkLoggedIn || (status === "unlocked" && account);

  // Track if mnemonic backup is pending (set by WalletConnect)
  // This keeps WelcomeBanner mounted until user confirms backup
  const [backupPending, setBackupPending] = useState(() => {
    try {
      return localStorage.getItem("nasun_wallet_backup_pending") === "true";
    } catch {
      return false;
    }
  });

  // Check localStorage periodically for backup pending state
  // (storage event only fires for other tabs, so we poll for same-tab changes)
  useEffect(() => {
    const checkBackupPending = () => {
      try {
        const pending = localStorage.getItem("nasun_wallet_backup_pending") === "true";
        setBackupPending(pending);
      } catch {
        setBackupPending(false);
      }
    };

    const interval = setInterval(checkBackupPending, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 pt-0 md:p-6 md:pt-1 max-w-7xl mx-auto">
      {/* ===== Backup Pending Overlay ===== */}
      {/* When connected but backup is pending, show WelcomeBanner as overlay */}
      {isConnected && backupPending && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-theme-bg-primary rounded-xl max-w-md w-full shadow-xl">
            <WelcomeBanner />
          </div>
        </div>
      )}

      {/* ===== Connected State: Portfolio-Centric Layout ===== */}
      {isConnected && !backupPending && (
        <>
          {/* Asset Overview Section */}
          <div className="mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Asset Overview - spans 1 column on lg */}
              <div className="lg:col-span-1">
                <AssetOverview />
              </div>
              {/* Token Balance List - spans 2 columns on lg */}
              <div className="lg:col-span-2">
                <TokenBalanceList />
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="mb-6">
            <h2 className="text-lg font-bold text-theme-text-primary mb-4">
              What would you like to do?
            </h2>
            <QuickActions />
          </div>

          {/* Activity (Trades & Transfers) */}
          <div className="mb-6">
            <h2 className="text-lg font-bold text-theme-text-primary mb-4">Recent Activity</h2>
            <ActivityTabs />
          </div>

          {/* Markets Section (compact) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HotMarketsCard />
            <PredictionHighlight />
          </div>
        </>
      )}

      {/* ===== Not Connected: Onboarding Layout ===== */}
      {!isConnected && (
        <>
          {/* Welcome Banner */}
          <div className="mb-6">
            <WelcomeBanner />
          </div>

          {/* Quick Actions */}
          <div className="mb-8">
            <h2 className="text-lg font-bold text-theme-text-primary mb-4">
              What would you like to do?
            </h2>
            <QuickActions />
          </div>

          {/* Two-column layout: Hot Markets + Predictions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <HotMarketsCard />
            <PredictionHighlight />
          </div>

          {/* Footer Tagline */}
          <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 text-center">
            <p className="text-sm text-theme-text-muted">
              Trade, predict, and earn — all in one place.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
