import React, { memo } from "react";
import RankBadge from "./RankBadge";
import UserProfile from "./UserProfile";
import EngagementBadges from "./EngagementBadges";
import ScoreBreakdown from "./ScoreBreakdown";
import { LeaderboardEntry } from "../types";
import { CSS_CLASSES } from "../constants";

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
}

const LeaderboardRow: React.FC<LeaderboardRowProps> = ({ entry }) => {
  return (
    <tr className={CSS_CLASSES.HOVER_ROW}>
      <td className={CSS_CLASSES.TABLE_CELL}>
        <RankBadge rank={entry.rank} />
      </td>
      <td className={CSS_CLASSES.TABLE_CELL}>
        <UserProfile
          displayName={entry.displayName}
          username={entry.username}
          profileImageUrl={entry.profileImageUrl}
          xUrl={entry.xUrl}
        />
      </td>
      <td className={CSS_CLASSES.TABLE_CELL}>
        <div className="font-bold text-blue-400">{entry.finalScore}</div>
      </td>
      <EngagementBadges
        totalReplies={entry.totalReplies}
        totalLikes={entry.totalLikes}
        totalReposts={entry.totalReposts}
        totalQuotes={entry.totalQuotes}
        layout="row"
      />
      <td className={CSS_CLASSES.TABLE_CELL}>
        <ScoreBreakdown
          totalReplies={entry.totalReplies}
          totalLikes={entry.totalLikes}
          totalReposts={entry.totalReposts}
          totalQuotes={entry.totalQuotes}
        />
      </td>
    </tr>
  );
};

export default memo(LeaderboardRow);
