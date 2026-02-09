import type { LeaderboardMode } from '../types';

const MODES: { id: LeaderboardMode; label: string }[] = [
  { id: 'volume', label: 'Volume' },
  { id: 'pnl', label: 'PnL' },
];

interface ModeSelectorProps {
  selected: LeaderboardMode;
  onSelect: (mode: LeaderboardMode) => void;
}

export function ModeSelector({ selected, onSelect }: ModeSelectorProps) {
  return (
    <div className="flex items-center bg-theme-bg-tertiary rounded-lg p-0.5">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onSelect(mode.id)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
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
