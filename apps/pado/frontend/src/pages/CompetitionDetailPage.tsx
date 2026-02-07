import { useParams, Link } from 'react-router-dom';
import { useWallet, useZkLogin, useSignerAddress } from '@nasun/wallet';
import { useCompetition, useCompetitionResults, CompetitionCountdown, CompetitionLeaderboard } from '../features/competitions';
import { STATUS_LABELS } from '../features/competitions/types';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatMinVolume(raw: string): string {
  try {
    const num = BigInt(raw || '0');
    if (num <= 0n) return 'None';
    const whole = num / 1_000_000n;
    return `$${whole.toLocaleString()}`;
  } catch {
    return 'None';
  }
}

export function CompetitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: comp, isLoading: compLoading } = useCompetition(id ?? null);
  const { data: results, isLoading: resultsLoading } = useCompetitionResults(id ?? null);

  const { status, account } = useWallet();
  const { isConnected: isZkLoggedIn } = useZkLogin();
  const signerAddress = useSignerAddress();
  const userAddress = (status === 'unlocked' && account) || isZkLoggedIn ? signerAddress : null;

  if (!id) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center text-theme-text-muted">
        Invalid competition ID
      </div>
    );
  }

  if (compLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-theme-bg-tertiary rounded w-48" />
          <div className="h-4 bg-theme-bg-tertiary rounded w-96" />
          <div className="h-32 bg-theme-bg-tertiary rounded" />
        </div>
      </div>
    );
  }

  if (!comp) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p className="text-theme-text-muted mb-4">Competition not found</p>
        <Link to="/competitions" className="text-sm text-pd3 hover:text-pd3/80">
          Back to Competitions
        </Link>
      </div>
    );
  }

  const isActive = comp.status === 'active';
  const isUpcoming = comp.status === 'upcoming';

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      {/* Back link */}
      <Link
        to="/competitions"
        className="inline-flex items-center gap-1 text-sm text-theme-text-muted hover:text-theme-text-primary transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Competitions
      </Link>

      {/* Competition Info Card */}
      <div className="bg-theme-bg-secondary rounded-lg border border-theme-border p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-lg font-semibold text-theme-text-primary">
            {comp.title}
          </h1>
          <span className={`text-xs font-medium shrink-0 px-2 py-1 rounded ${
            isActive ? 'bg-green-500/10 text-green-400' :
            isUpcoming ? 'bg-blue-500/10 text-blue-400' :
            'bg-theme-bg-tertiary text-theme-text-muted'
          }`}>
            {isActive && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1 align-middle animate-pulse" />
            )}
            {STATUS_LABELS[comp.status]}
          </span>
        </div>

        {comp.description && (
          <p className="text-sm text-theme-text-secondary mb-4">
            {comp.description}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-theme-bg-primary rounded-lg p-3">
            <div className="text-xs text-theme-text-muted mb-1">Start</div>
            <div className="text-xs text-theme-text-primary">{formatDate(comp.start_ms)}</div>
          </div>
          <div className="bg-theme-bg-primary rounded-lg p-3">
            <div className="text-xs text-theme-text-muted mb-1">End</div>
            <div className="text-xs text-theme-text-primary">{formatDate(comp.end_ms)}</div>
          </div>
          <div className="bg-theme-bg-primary rounded-lg p-3">
            <div className="text-xs text-theme-text-muted mb-1">Min Volume</div>
            <div className="text-xs text-theme-text-primary">{formatMinVolume(comp.min_volume)}</div>
          </div>
          <div className="bg-theme-bg-primary rounded-lg p-3">
            <div className="text-xs text-theme-text-muted mb-1">
              {isActive ? 'Ends in' : isUpcoming ? 'Starts in' : 'Duration'}
            </div>
            <div className="text-xs text-pd3">
              {(isActive || isUpcoming) ? (
                <CompetitionCountdown
                  targetTime={isActive ? comp.end_ms : comp.start_ms}
                  compact
                />
              ) : (
                `${Math.round((comp.end_ms - comp.start_ms) / (24 * 60 * 60 * 1000))}d`
              )}
            </div>
          </div>
        </div>

        {comp.prize_description && (
          <div className="mt-3 pt-3 border-t border-theme-border">
            <span className="text-xs text-theme-text-muted">Prize: </span>
            <span className="text-xs text-theme-text-primary">{comp.prize_description}</span>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-theme-bg-secondary rounded-lg border border-theme-border overflow-hidden">
        <div className="px-4 py-3 border-b border-theme-border">
          <h3 className="text-sm font-medium text-theme-text-primary">Rankings</h3>
        </div>
        <CompetitionLeaderboard
          traders={results?.traders ?? comp.topTraders ?? []}
          isLoading={resultsLoading}
          currentUserAddress={userAddress}
        />
      </div>
    </div>
  );
}
