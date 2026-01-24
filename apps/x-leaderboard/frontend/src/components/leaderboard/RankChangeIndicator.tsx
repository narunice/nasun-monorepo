import React from "react";
import { useTranslation } from "react-i18next";
import { RankChangeData } from "@/types";

interface RankChangeIndicatorProps {
  rankChange?: RankChangeData | null;
  variant?: "full" | "short";
}

const RankChangeIndicator: React.FC<RankChangeIndicatorProps> = ({ rankChange, variant = "full" }) => {
  const { t } = useTranslation("leaderboard");

  if (!rankChange || rankChange.direction === "same") {
    return <span className="font-medium text-gray-500">-</span>;
  }

  const { direction, amount } = rankChange;

  // The 'full' variant is used in MyRankCard, keep its design.
  // Note: "same" case is already handled by early return above
  if (variant === 'full') {
    const directionConfig = {
      up: { color: "text-green-400", text: t("myRank.rankChange.up", { amount }) },
      down: { color: "text-red-400", text: t("myRank.rankChange.down", { amount }) },
      new: { color: "text-green-400", text: t("myRank.rankChange.new") },
    };

    const config = directionConfig[direction];

    return <span className={`font-medium ${config.color}`}>{config.text}</span>;
  }

  // New design for the 'short' variant used in the main leaderboard table
  switch (direction) {
    case 'up':
      return (
        <div className="flex flex-col items-center font-semibold leading-none">
          <span className="text-green-500" style={{ fontSize: '0.7em' }}>▲</span>
          <span className="text-green-500 mt-0.5">{amount}</span>
        </div>
      );
    case 'down':
      return (
        <div className="flex flex-col items-center font-semibold leading-none">
          <span className="text-red-500" style={{ fontSize: '0.7em' }}>▼</span>
          <span className="text-red-500 mt-0.5">{amount}</span>
        </div>
      );
    case 'new':
      return (
        <div className="flex flex-col items-center font-bold leading-none">
          <span className="text-green-500" style={{ fontSize: '0.7em' }}>▲</span>
          <span className="text-green-500 mt-0.5">NEW</span>
        </div>
      );
    default:
      return <span className="font-medium text-gray-500">-</span>;
  }
};

export default RankChangeIndicator;
