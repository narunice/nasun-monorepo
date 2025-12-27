import React, { memo } from "react";
import LeaderboardRow from "./LeaderboardRow";
import { LeaderboardEntry } from "../types";
import { CSS_CLASSES } from "../constants";
import { useTranslation } from "react-i18next";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

const LeaderboardTable: React.FC<LeaderboardTableProps> = memo(({ entries }) => {
  const { t } = useTranslation("leaderboard");

  return (
    <div className="rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className={CSS_CLASSES.TABLE_HEADER_BG}>
          <tr>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.rank")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.user")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.finalScore")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.replies")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.likes")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.reposts")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.quotes")}</th>
            <th className={CSS_CLASSES.TABLE_HEADER}>{t("table.headers.scoreBreakdown")}</th>
          </tr>
        </thead>
        <tbody className={`${CSS_CLASSES.TABLE_BODY_BG} ${CSS_CLASSES.TABLE_BODY_DIVIDER}`}>
          {entries.map((entry, index) => (
            <LeaderboardRow
              key={`leaderboard-${entry.userId}-rank-${entry.rank}-idx-${index}`}
              entry={entry}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

LeaderboardTable.displayName = "LeaderboardTable";

export default LeaderboardTable;
