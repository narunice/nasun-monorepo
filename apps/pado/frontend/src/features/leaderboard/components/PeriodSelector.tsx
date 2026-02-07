import type { Period } from '../types';
import { PERIOD_LABELS } from '../types';

interface PeriodSelectorProps {
  selected: Period;
  onSelect: (period: Period) => void;
}

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];

export function PeriodSelector({ selected, onSelect }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1">
      {PERIODS.map((period) => (
        <button
          key={period}
          onClick={() => onSelect(period)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            selected === period
              ? 'bg-pd3/10 text-pd3'
              : 'text-theme-text-muted hover:text-theme-text-secondary hover:bg-theme-bg-tertiary'
          }`}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
