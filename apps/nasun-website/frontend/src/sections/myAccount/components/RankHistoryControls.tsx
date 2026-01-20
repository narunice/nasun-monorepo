import { FC, RefObject } from "react";
import { 
  CumulativePeriod, 
  DateRangeOption 
} from "@/features/leaderboard/types/leaderboard";
import { ShareRankHistoryButton } from "@/features/leaderboard/components/ShareRankHistoryButton";

interface DateRangeOptionType {
  value: DateRangeOption;
  label: string;
}

interface RankHistoryControlsProps {
  label: string;
  selectedDays: DateRangeOption;
  onDaysChange: (days: DateRangeOption) => void;
  dateRangeOptions: DateRangeOptionType[];
  showShareButton: boolean;
  chartRef: RefObject<HTMLDivElement | null>;
  username: string;
  selectedPeriod: CumulativePeriod;
}

export const RankHistoryControls: FC<RankHistoryControlsProps> = ({
  label,
  selectedDays,
  onDaysChange,
  dateRangeOptions,
  showShareButton,
  chartRef,
  username,
  selectedPeriod,
}) => {
  return (
    <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
      <div className="flex items-center gap-2">
        <label htmlFor="date-range" className="font-medium text-white">
          {label}:
        </label>
        <select
          id="date-range"
          value={selectedDays}
          onChange={(e) => onDaysChange(Number(e.target.value) as DateRangeOption)}
          className="px-3 py-1.5 rounded-lg border border-gray-600 bg-gray-900 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {dateRangeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {showShareButton && (
        <ShareRankHistoryButton
          chartRef={chartRef}
          username={username}
          period={selectedPeriod}
          days={selectedDays}
        />
      )}
    </div>
  );
};
