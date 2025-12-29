/**
 * RankHistoryCard Component
 *
 * Wraps RankHistorySection in a DashboardCard for the Bento Grid layout.
 */

import { FC } from "react";
import { DashboardCard } from "../../ui/DashboardCard";
import { RankHistorySection } from "./RankHistorySection";

interface RankHistoryCardProps {
  username: string | null;
  className?: string;
}

export const RankHistoryCard: FC<RankHistoryCardProps> = ({
  username,
  className = "",
}) => {
  return (
    <DashboardCard className={className}>
      <RankHistorySection username={username} />
    </DashboardCard>
  );
};

export default RankHistoryCard;
