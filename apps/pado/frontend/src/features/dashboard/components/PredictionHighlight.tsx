/**
 * PredictionHighlight
 * Shows featured prediction markets on the dashboard
 */

import { useMarkets } from '../../prediction';
import { calculateProbabilityFromOrderbook } from '../../prediction/types';

export function PredictionHighlight() {
  const { markets, isLoading } = useMarkets();

  if (isLoading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-theme-bg-tertiary rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-16 bg-theme-bg-tertiary rounded" />
            <div className="h-16 bg-theme-bg-tertiary rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
        <h2 className="font-bold text-theme-text-primary mb-1">Prediction Markets</h2>
        <p className="text-xs xl:text-sm text-theme-text-muted mb-3">Bet on future events and win rewards</p>
        <span className="text-sm xl:text-base text-theme-text-muted cursor-not-allowed font-medium">
          Explore Markets &rarr;
        </span>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-bold text-theme-text-primary">Prediction Markets</h2>
        <span className="text-xs xl:text-sm text-theme-text-muted cursor-not-allowed">
          View All →
        </span>
      </div>
      <p className="text-xs xl:text-sm text-theme-text-muted mb-3">Bet on future events and win rewards</p>

      <div className="space-y-3">
        {markets.slice(0, 3).map(({ market, yesOrderbook }) => {
          // Calculate YES probability using Polymarket midpoint method
          const { yesProbability } = calculateProbabilityFromOrderbook(
            yesOrderbook,
            null
          );

          return (
            <div
              key={market.id}
              className="group block p-3 -mx-1 rounded-lg cursor-not-allowed opacity-60"
            >
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm xl:text-base font-medium text-theme-text-primary line-clamp-1 flex-1">
                  {market.question}
                </p>
                <svg className="w-4 h-4 shrink-0 text-theme-text-muted hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 bg-theme-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${yesProbability}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs xl:text-sm">
                  <span className="text-green-500 font-medium">{Math.round(yesProbability)}%</span>
                  <span className="text-theme-text-muted">YES</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
