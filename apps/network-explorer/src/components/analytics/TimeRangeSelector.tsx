import type { TimeRange } from '../../lib/analytics/types';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'all', label: 'All' },
];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex gap-1 bg-muted/20 rounded-sm p-1 w-fit border border-border">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${
            value === opt.value
              ? 'bg-ne1/20 text-foreground'
              : 'text-muted-foreground hover:text-foreground border border-transparent'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
