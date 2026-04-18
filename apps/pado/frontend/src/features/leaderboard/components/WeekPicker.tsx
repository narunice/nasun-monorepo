import type { AvailableWeek } from '../hooks/useLeaderboard';

interface WeekPickerProps {
  weeks: AvailableWeek[];
  selectedWeekId: string;
  currentWeekId: string;
  onChange: (weekId: string) => void;
}

export function WeekPicker({ weeks, selectedWeekId, currentWeekId, onChange }: WeekPickerProps) {
  if (weeks.length === 0) return null;

  // Ensure current week always appears as first option even before it has snapshot data
  const options = weeks.some(w => w.weekId === currentWeekId)
    ? weeks
    : [{ weekId: currentWeekId, label: currentWeekId }, ...weeks];

  return (
    <select
      value={selectedWeekId}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-theme-bg-tertiary text-theme-text-secondary border border-theme-border rounded-md px-2 py-1 focus:outline-none focus:border-nasun-c3"
    >
      {options.map((w) => (
        <option key={w.weekId} value={w.weekId}>
          {w.weekId === currentWeekId ? `This Week (${w.weekId.split('-')[1]})` : w.label}
        </option>
      ))}
    </select>
  );
}
