/**
 * PredictionHighlight
 * Shows featured prediction markets on the dashboard
 */

import { Link } from 'react-router-dom';
import { useMarkets } from '../../prediction';

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
    return null;
  }

  return (
    <div className="bg-theme-bg-secondary border border-theme-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-theme-text-primary">Prediction Markets</h2>
        <Link to="/predict" className="text-xs text-blue-400 hover:text-blue-300">
          View All →
        </Link>
      </div>

      <div className="space-y-3">
        {markets.slice(0, 3).map(({ market, yesOrderbook }) => {
          // Calculate YES probability from best ask (Polymarket style)
          const bestAsk = yesOrderbook?.asks?.[0];
          const yesProbability = bestAsk ? Math.round(bestAsk.price * 100) : 50;

          return (
            <Link
              key={market.id}
              to={`/predict/${market.id}`}
              className="block p-3 -mx-1 rounded-lg hover:bg-theme-bg-tertiary transition-colors"
            >
              <p className="text-sm font-medium text-theme-text-primary line-clamp-1 mb-2">
                {market.question}
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="h-2 bg-theme-bg-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500"
                      style={{ width: `${yesProbability}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-green-500 font-medium">{yesProbability}%</span>
                  <span className="text-theme-text-muted">YES</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
