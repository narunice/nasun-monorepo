import type { ScoreScope } from '../types';

const SCOPES: { id: ScoreScope; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'alltime', label: 'All Time' },
];

interface ScopeSelectorProps {
  selected: ScoreScope;
  onSelect: (scope: ScoreScope) => void;
}

export function ScopeSelector({ selected, onSelect }: ScopeSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center bg-theme-bg-tertiary rounded-lg p-0.5">
        {SCOPES.map((scope) => (
          <button
            key={scope.id}
            onClick={() => onSelect(scope.id)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              selected === scope.id
                ? 'bg-theme-bg-secondary text-theme-text-primary shadow-sm'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {scope.label}
          </button>
        ))}
      </div>
      {selected === 'weekly' && (
        <span className="text-[10px] text-theme-text-muted">Resets Mon 00:00 UTC</span>
      )}
    </div>
  );
}
