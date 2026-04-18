import type { ViewMode } from '../types';

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'current', label: 'Current Week' },
  { id: 'past', label: 'Past Weeks' },
];

interface ScopeSelectorProps {
  selected: ViewMode;
  onSelect: (mode: ViewMode) => void;
  pastDisabled?: boolean;
}

export function ScopeSelector({ selected, onSelect, pastDisabled }: ScopeSelectorProps) {
  return (
    <div className="flex items-center bg-theme-bg-tertiary rounded-lg p-0.5">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onSelect(mode.id)}
          disabled={mode.id === 'past' && pastDisabled}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            selected === mode.id
              ? 'bg-theme-bg-secondary text-theme-text-primary shadow-sm'
              : 'text-theme-text-muted hover:text-theme-text-secondary'
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
