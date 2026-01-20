import { FC } from "react";
import { CumulativePeriod } from "@/features/leaderboard/types/leaderboard";

interface PeriodOption {
  value: CumulativePeriod;
  label: string;
}

interface RankHistoryTabsProps {
  options: PeriodOption[];
  selectedPeriod: CumulativePeriod;
  onPeriodChange: (period: CumulativePeriod) => void;
}

export const RankHistoryTabs: FC<RankHistoryTabsProps> = ({
  options,
  selectedPeriod,
  onPeriodChange,
}) => {
  return (
    <div className="border-b border-gray-700">
      <div className="flex items-center space-x-4">
        {options.map((option) => {
          const isActive = selectedPeriod === option.value;
          return (
            <button
              key={option.value}
              onClick={() => onPeriodChange(option.value)}
              className={`
                relative px-1 py-3 font-medium outline-none transition-colors
                ${isActive ? "text-white" : "text-gray-400 hover:text-white"}
              `}
            >
              {option.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-white rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
