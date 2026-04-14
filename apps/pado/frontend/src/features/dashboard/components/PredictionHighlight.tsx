/**
 * PredictionHighlight
 * Shows featured prediction markets on the dashboard.
 *
 * While VITE_IDEA_SUBMISSION_ENABLED is on, the card is split:
 *   - top half: a single prediction market preview (not clickable — markets
 *     are still gated, the row is there to hint at what's coming)
 *   - bottom half: an "Ideas for Prediction Market" button routing to /predict
 *     (which currently renders the Ideas & Feedback form).
 */

import { Link } from 'react-router-dom';
import { useMarkets } from '../../prediction';
import { calculateProbabilityFromOrderbook } from '../../prediction/types';

const IDEA_MODE = import.meta.env.VITE_IDEA_SUBMISSION_ENABLED === 'true';

function LoadingCard() {
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

interface MarketRowProps {
  question: string;
  yesProbability: number;
}

function MarketRow({ question, yesProbability }: MarketRowProps) {
  return (
    <div className="group block p-3 -mx-1 rounded-lg cursor-not-allowed opacity-60">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm xl:text-base font-medium text-theme-text-primary line-clamp-1 flex-1">
          {question}
        </p>
        <svg className="w-4 h-4 shrink-0 text-theme-text-muted hidden group-hover:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-theme-bg-tertiary rounded-full overflow-hidden">
            <div className="h-full bg-green-500" style={{ width: `${yesProbability}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs xl:text-sm">
          <span className="text-green-500 font-medium">{Math.round(yesProbability)}%</span>
          <span className="text-theme-text-muted">YES</span>
        </div>
      </div>
    </div>
  );
}

export function PredictionHighlight() {
  const { markets, isLoading } = useMarkets();

  if (isLoading) {
    return <LoadingCard />;
  }

  // IDEA_MODE: split card (up to 3 market previews on top, idea submission button below).
  if (IDEA_MODE) {
    const previews = markets.slice(0, 3);

    return (
      <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4 flex flex-col">
        <h2 className="font-bold text-theme-text-primary mb-1">Prediction Markets</h2>
        <p className="text-xs xl:text-sm text-theme-text-muted mb-3">Coming soon</p>

        <div className="flex-1 space-y-1">
          {previews.length > 0 ? (
            previews.map(({ market, yesOrderbook }) => {
              const { yesProbability } = calculateProbabilityFromOrderbook(yesOrderbook, null);
              return (
                <MarketRow
                  key={market.id}
                  question={market.question}
                  yesProbability={yesProbability}
                />
              );
            })
          ) : (
            <div className="p-3 -mx-1 rounded-lg opacity-60 text-sm text-theme-text-muted">
              Markets will appear here soon.
            </div>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-theme-border">
          <Link
            to="/predict"
            className="flex items-center justify-between gap-2 p-2 -mx-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-sm font-medium text-indigo-300">Ideas for Prediction Market</span>
            </div>
            <span className="text-xs text-indigo-400 group-hover:translate-x-0.5 transition-transform">&rarr;</span>
          </Link>
        </div>
      </div>
    );
  }

  // Non-IDEA mode: original locked preview.
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
          const { yesProbability } = calculateProbabilityFromOrderbook(yesOrderbook, null);
          return <MarketRow key={market.id} question={market.question} yesProbability={yesProbability} />;
        })}
      </div>
    </div>
  );
}
