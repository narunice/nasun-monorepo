import { Link } from 'react-router-dom';
import { useActiveCompetitions } from '../hooks/useCompetitions';
import { CompetitionCountdown } from './CompetitionCountdown';

export function CompetitionBanner() {
  const { data } = useActiveCompetitions();

  const activeComp = data?.competitions?.[0];
  if (!activeComp) return null;

  return (
    <Link
      to={`/competitions/${activeComp.id}`}
      className="block rounded-lg border border-pd3/30 bg-gradient-to-r from-pd3/5 to-pd3/10 p-4 hover:border-pd3/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-sm font-semibold text-theme-text-primary truncate">
              {activeComp.title}
            </span>
            <span className="text-xs text-green-400 font-medium">LIVE</span>
          </div>
          {activeComp.prize_description && (
            <p className="text-xs text-theme-text-muted mt-1 truncate">
              {activeComp.prize_description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-sm font-mono text-pd3">
            <CompetitionCountdown targetTime={activeComp.end_ms} compact />
          </div>
          <svg className="w-4 h-4 text-theme-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
