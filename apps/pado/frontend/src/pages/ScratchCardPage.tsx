/**
 * Scratch Card Page
 * Instant lottery with on-chain VRF randomness
 */

import {
  ScratchCardArea,
  PrizeTableDisplay,
  PoolStatusBar,
  MyWinningCards,
  MyPurchaseHistory,
} from '../features/scratchcard';

export function ScratchCardPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-text-primary">
          Scratch Cards
        </h1>
        <p className="text-sm text-theme-text-muted mt-1">
          Buy a card, scratch to reveal your prize. Up to 100x!
        </p>
      </div>

      {/* Pool Status */}
      <PoolStatusBar />

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Scratch Card */}
        <div className="bg-theme-bg-secondary rounded-xl p-6">
          <ScratchCardArea />
        </div>

        {/* Right: Prize Table */}
        <div className="space-y-4">
          <PrizeTableDisplay />
        </div>
      </div>

      {/* Winning Cards */}
      <div className="bg-theme-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-theme-text-primary mb-3">
          My Winning Cards
        </h2>
        <MyWinningCards />
      </div>

      {/* Purchase History (all, compact) */}
      <div className="bg-theme-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-theme-text-primary mb-3">
          Purchase History
        </h2>
        <MyPurchaseHistory />
      </div>
    </div>
  );
}
