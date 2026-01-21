/**
 * RankHistoryCard Component
 *
 * Wraps RankHistorySection in an OuterBox for the Bento Grid layout.
 */

import { FC } from "react";
import { OuterBox } from "@/components/ui";
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
    <OuterBox color="c5" padding="sm" className={className}>
      <RankHistorySection username={username} embedded />
    </OuterBox>
  );
};

export default RankHistoryCard;
