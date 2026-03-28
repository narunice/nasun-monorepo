/**
 * Number Match Page
 * Pick numbers, match the winning number to win. Instant VRF result.
 */

import { GameArea } from '../features/numbermatch/components/GameArea';
import { PayoutTable } from '../features/numbermatch/components/PayoutTable';
import { PoolStatusBar } from '../features/numbermatch/components/PoolStatusBar';

export function NumberMatchPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-theme-text-primary">
          Number Match
        </h1>
        <p className="text-sm text-theme-text-muted mt-1">
          Pick your numbers, match the draw to win. More picks = better odds!
        </p>
      </div>

      {/* Pool Status */}
      <PoolStatusBar />

      {/* Main Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Game */}
        <GameArea />

        {/* Right: Payout Table */}
        <PayoutTable />
      </div>
    </div>
  );
}
