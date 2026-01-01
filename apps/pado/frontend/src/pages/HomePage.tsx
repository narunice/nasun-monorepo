/**
 * HomePage
 * Main dashboard page - entry point for the app
 *
 * TODO (Phase UX-B): Implement full dashboard with:
 * - NetWorthCard: Total asset value
 * - PortfolioHealthCard: Margin status
 * - EarnOpportunityCard: Yield suggestions
 * - HotMarketsCard: Trending markets
 * - PredictionHighlight: Featured predictions
 * - QuickActions: Common action buttons
 */

import { Link } from 'react-router-dom';
import { useWallet, useMultiBalance } from '@nasun/wallet';
import { WalletConnect } from '@nasun/wallet-ui';
import { useMarkets } from '../features/prediction';

export function HomePage() {
  const { status, account } = useWallet();
  const { data: balances } = useMultiBalance();
  const { markets } = useMarkets();

  const isConnected = status === 'unlocked' && account;

  // Calculate total net worth (simplified)
  const totalNetWorth = balances ? Object.values(balances).reduce((sum, b) => sum + (b || 0n), 0n) : 0n;
  const formattedNetWorth = (Number(totalNetWorth) / 1e9).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
          Welcome to Pado
        </h1>
        <p className="text-theme-text-secondary mt-1">
          The Decentralized Everything Exchange
        </p>
      </div>

      {/* Connect Wallet CTA (if not connected) */}
      {!isConnected && (
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-6 mb-6 text-white">
          <h2 className="text-xl font-bold mb-2">Get Started</h2>
          <p className="text-blue-100 mb-4">
            Connect your wallet to start trading, earning, and predicting.
          </p>
          <WalletConnect />
        </div>
      )}

      {/* Net Worth Card */}
      {isConnected && (
        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-theme-text-secondary">Net Worth</h2>
            <span className="text-xs text-theme-text-muted">Devnet</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-theme-text-primary">
              {formattedNetWorth}
            </span>
            <span className="text-lg text-theme-text-secondary">NASUN</span>
          </div>
          <p className="text-xs text-theme-text-muted mt-2">
            Total balance across all tokens
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Link
          to="/trade"
          className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors group"
        >
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-500/20 transition-colors">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
          <h3 className="font-medium text-theme-text-primary">Trade</h3>
          <p className="text-xs text-theme-text-muted mt-1">Swap tokens</p>
        </Link>

        <Link
          to="/wallet"
          className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors group"
        >
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-500/20 transition-colors">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
          <h3 className="font-medium text-theme-text-primary">Send</h3>
          <p className="text-xs text-theme-text-muted mt-1">Transfer tokens</p>
        </Link>

        <Link
          to="/predict"
          className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors group"
        >
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-500/20 transition-colors">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="font-medium text-theme-text-primary">Predict</h3>
          <p className="text-xs text-theme-text-muted mt-1">Bet on events</p>
        </Link>

        <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 opacity-60 cursor-not-allowed">
          <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center mb-3">
            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="font-medium text-theme-text-muted">Earn</h3>
          <p className="text-xs text-theme-text-muted mt-1">Coming Soon</p>
        </div>
      </div>

      {/* Prediction Markets Highlight */}
      {markets.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-theme-text-primary">Prediction Markets</h2>
            <Link to="/predict" className="text-sm text-blue-400 hover:text-blue-300">
              View All →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {markets.slice(0, 2).map(({ market, yesOrderbook }) => {
              // Calculate YES probability from best ask price (Polymarket style)
              const bestAsk = yesOrderbook?.asks?.[0];
              const yesProbability = bestAsk
                ? Math.round(bestAsk.price * 100)
                : 50;

              return (
                <Link
                  key={market.id}
                  to={`/predict/${market.id}`}
                  className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 hover:bg-theme-bg-tertiary transition-colors"
                >
                  <p className="font-medium text-theme-text-primary text-sm line-clamp-2">
                    {market.question}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1">
                      <div className="h-2 bg-theme-bg-tertiary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${yesProbability}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-green-500">
                      {yesProbability}% YES
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Info Footer */}
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 text-center">
        <p className="text-sm text-theme-text-muted">
          One account. One margin pool. Every asset works harder.
        </p>
      </div>
    </div>
  );
}
