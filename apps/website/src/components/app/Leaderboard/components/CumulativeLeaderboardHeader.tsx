import React, { memo } from "react";
import { CumulativeLeaderboardData } from "../types/leaderboard";

interface CumulativeLeaderboardHeaderProps {
  data: CumulativeLeaderboardData;
  showVersionBadge?: boolean;
  showScoreSystem?: boolean;
}

const CumulativeLeaderboardHeader: React.FC<CumulativeLeaderboardHeaderProps> = memo(({ data }) => {
  const { metadata } = data;

  // 🔍 디버깅: metadata 확인
  console.log("[CumulativeLeaderboardHeader] metadata:", {
    period: metadata.period,
    periodStartDate: metadata.periodStartDate,
    periodEndDate: metadata.periodEndDate,
    totalUsers: metadata.totalUsers,
  });

  return null;
});

CumulativeLeaderboardHeader.displayName = "CumulativeLeaderboardHeader";

export default CumulativeLeaderboardHeader;
