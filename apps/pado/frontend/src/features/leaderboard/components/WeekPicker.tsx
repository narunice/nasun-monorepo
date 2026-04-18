import type { AvailableWeek } from '../hooks/useLeaderboard';

interface WeekPickerProps {
  // Caller is responsible for filtering out current week before passing
  weeks: AvailableWeek[];
  selectedWeekId: string;
  onChange: (weekId: string) => void;
}

export function WeekPicker({ weeks, selectedWeekId, onChange }: WeekPickerProps) {
  if (weeks.length === 0) return null;

  return (
    <select
      value={selectedWeekId}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-theme-bg-tertiary text-theme-text-secondary border border-theme-border rounded-md px-2 py-1 focus:outline-none focus:border-nasun-c3"
    >
      {weeks.map((w) => (
        <option key={w.weekId} value={w.weekId}>
          {w.label}
        </option>
      ))}
    </select>
  );
}
