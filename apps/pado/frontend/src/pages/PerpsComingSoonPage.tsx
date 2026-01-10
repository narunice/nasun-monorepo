/**
 * PerpsComingSoonPage
 * Placeholder page for Perpetual Futures trading (Phase 11)
 */

import { Link } from 'react-router-dom';

export function PerpsComingSoonPage() {
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="text-center py-16">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 bg-purple-500/10 rounded-2xl flex items-center justify-center">
          <svg
            className="w-10 h-10 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-theme-text-primary mb-3">
          Perpetual Futures
        </h1>

        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 rounded-full mb-6">
          <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-purple-400">
            Coming in Phase 11
          </span>
        </div>

        {/* Description */}
        <p className="text-theme-text-secondary max-w-md mx-auto mb-8">
          Trade perpetual futures with up to 10x leverage on BTC, ETH, and more.
          Cross-margin and isolated margin modes will be supported.
        </p>

        {/* Features Preview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-xl mx-auto mb-8">
          <div className="p-4 bg-theme-bg-secondary rounded-xl">
            <div className="text-2xl font-bold text-theme-text-primary">10x</div>
            <div className="text-xs text-theme-text-muted">Max Leverage</div>
          </div>
          <div className="p-4 bg-theme-bg-secondary rounded-xl">
            <div className="text-2xl font-bold text-theme-text-primary">24/7</div>
            <div className="text-xs text-theme-text-muted">Trading</div>
          </div>
          <div className="p-4 bg-theme-bg-secondary rounded-xl">
            <div className="text-2xl font-bold text-theme-text-primary">0</div>
            <div className="text-xs text-theme-text-muted">Funding Rate (Initially)</div>
          </div>
        </div>

        {/* CTA */}
        <Link
          to="/markets/spot"
          className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
            />
          </svg>
          Trade Spot Now
        </Link>
      </div>
    </div>
  );
}
