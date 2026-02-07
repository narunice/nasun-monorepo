import { Link } from 'react-router-dom';
import type { Competition } from '../types';
import { STATUS_LABELS, STATUS_COLORS } from '../types';
import { CompetitionCountdown } from './CompetitionCountdown';

interface CompetitionCardProps {
  competition: Competition;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function CompetitionCard({ competition }: CompetitionCardProps) {
  const isActive = competition.status === 'active';
  const isUpcoming = competition.status === 'upcoming';

  return (
    <Link
      to={`/competitions/${competition.id}`}
      className="block bg-theme-bg-secondary rounded-lg border border-theme-border p-4 hover:border-theme-border-hover transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-theme-text-primary truncate">
          {competition.title}
        </h3>
        <span className={`text-xs font-medium shrink-0 ${STATUS_COLORS[competition.status]}`}>
          {isActive && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mr-1 align-middle" />
          )}
          {STATUS_LABELS[competition.status]}
        </span>
      </div>

      {competition.description && (
        <p className="text-xs text-theme-text-muted mb-3 line-clamp-2">
          {competition.description}
        </p>
      )}

      <div className="flex items-center justify-between text-xs">
        <div className="text-theme-text-muted">
          {formatDate(competition.start_ms)} - {formatDate(competition.end_ms)}
        </div>
        {(isActive || isUpcoming) && (
          <div className="text-pd3 font-mono">
            <CompetitionCountdown
              targetTime={isActive ? competition.end_ms : competition.start_ms}
              compact
            />
          </div>
        )}
      </div>

      {competition.prize_description && (
        <div className="mt-2 pt-2 border-t border-theme-border">
          <span className="text-xs text-theme-text-secondary">
            {competition.prize_description}
          </span>
        </div>
      )}
    </Link>
  );
}
