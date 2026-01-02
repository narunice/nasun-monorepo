/**
 * HomePage
 * Main dashboard page - entry point for the app
 *
 * Layout:
 * - Welcome Banner (if not connected)
 * - Net Worth Card (if connected)
 * - Quick Actions grid
 * - Two-column layout: Hot Markets + Prediction Highlight
 * - Footer tagline
 */

import { useWallet, useZkLogin } from '@nasun/wallet';
import {
  NetWorthCard,
  QuickActions,
  HotMarketsCard,
  PredictionHighlight,
  WelcomeBanner,
} from '../features/dashboard';

export function HomePage() {
  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const isConnected = isZkLoggedIn || (status === 'unlocked' && account);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Dashboard Header (only when connected) */}
      {isConnected && (
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">Dashboard</h1>
        </div>
      )}

      {/* Welcome Banner (if not connected) */}
      {!isConnected && (
        <div className="mb-6">
          <WelcomeBanner />
        </div>
      )}

      {/* Net Worth Card (if connected) */}
      {isConnected && (
        <div className="mb-6">
          <NetWorthCard />
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-bold text-theme-text-primary mb-4">Quick Actions</h2>
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
          One account. One margin pool. Every asset works harder.
        </p>
      </div>
    </div>
  );
}
