import { useCompetitions, CompetitionCard } from '../features/competitions';

export function CompetitionsPage() {
  const { data, isLoading } = useCompetitions();

  const competitions = data?.competitions ?? [];
  const active = competitions.filter((c) => c.status === 'active');
  const upcoming = competitions.filter((c) => c.status === 'upcoming');
  const ended = competitions.filter((c) => c.status === 'ended');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-theme-text-primary">Competitions</h1>
          <span className="text-xs font-bold tracking-wider text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-400/10 border border-yellow-300 dark:border-yellow-400/30 px-2 py-0.5 rounded">FEATURE PREVIEW</span>
        </div>
        <p className="text-sm text-theme-text-muted mt-0.5">
          Compete for prizes based on trading volume
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-theme-bg-secondary rounded-lg border border-theme-border p-4">
              <div className="h-4 bg-theme-bg-tertiary rounded w-48 mb-2" />
              <div className="h-3 bg-theme-bg-tertiary rounded w-64 mb-3" />
              <div className="h-3 bg-theme-bg-tertiary rounded w-32" />
            </div>
          ))}
        </div>
      )}

      {/* Active Competitions */}
      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-green-400 mb-3 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Active
          </h2>
          <div className="space-y-3">
            {active.map((c) => (
              <CompetitionCard key={c.id} competition={c} />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Competitions */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-blue-400 mb-3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map((c) => (
              <CompetitionCard key={c.id} competition={c} />
            ))}
          </div>
        </section>
      )}

      {/* Ended Competitions */}
      {ended.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-theme-text-muted mb-3">Past</h2>
          <div className="space-y-3">
            {ended.map((c) => (
              <CompetitionCard key={c.id} competition={c} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!isLoading && competitions.length === 0 && (
        <div className="text-center py-12 text-theme-text-muted">
          <p className="text-sm">No competitions yet</p>
          <p className="text-xs mt-1">Check back soon for upcoming trading competitions</p>
        </div>
      )}
    </div>
  );
}
