import React, { memo } from "react";
import { CumulativeLeaderboardEntry } from "../types";
import CumulativeLeaderboardRow from "./CumulativeLeaderboardRow";
import { useTranslation } from "react-i18next";
import { Table } from "@/components/ui/table/Table";
import { TableHeader } from "@/components/ui/table/TableHeader";
import { TableBody } from "@/components/ui/table/TableBody";
import { TableRow } from "@/components/ui/table/TableRow";
import { TableHead } from "@/components/ui/table/TableHead";

interface CumulativeLeaderboardTableProps {
  entries: CumulativeLeaderboardEntry[];
  totalUsers?: number;
  showXUrl?: boolean;
  /** Phase 2: 하이라이트할 사용자명 */
  highlightedUsername?: string | null;
  /** Phase 2: 하이라이트 체크 함수 */
  isHighlighted?: (username: string) => boolean;
}

const CumulativeLeaderboardTable: React.FC<CumulativeLeaderboardTableProps> = memo(
  ({ entries, showXUrl = true, highlightedUsername, isHighlighted }) => {
    const { t } = useTranslation("leaderboard");

    if (entries.length === 0) {
      return (
        <div className="text-center py-16 text-gray-400 bg-gray-800/50 rounded-lg">
          <div className="font-medium mb-2">
            {t("states.noMoreEntries", "표시할 데이터가 없습니다.")}
          </div>
          <div>선택하신 기간에 해당하는 데이터가 없습니다.</div>
        </div>
      );
    }

    return (
      <Table variant="c3" className=" w-full">
        <TableHeader variant="c3">
          <TableRow variant="c3">
            {/* RANK - mobile: # */}
            <TableHead align="center" className="w-10 md:w-16">
              <span className="hidden md:inline">{t("table.headers.rank", "순위")}</span>
              <span className="md:hidden">#</span>
            </TableHead>
            {/* USER - compact width */}
            <TableHead align="left" className="min-w-[60px]">
              {t("table.headers.user", "사용자")}
            </TableHead>
            {/* COMMUNITY MEMBER - xl only (least important) */}
            <TableHead align="center" className="hidden xl:table-cell w-24">
              <div>Community</div>
              <div>Member</div>
            </TableHead>
            {/* LANGUAGE - always visible */}
            <TableHead align="center" className="w-10 md:w-14">
              Lang
            </TableHead>
            {/* FOLLOWERS - always Fol */}
            <TableHead align="center" className="w-10 md:w-14">
              Fol
            </TableHead>
            {/* POINTS - abbreviated */}
            <TableHead align="center" className="w-12 md:w-16">
              <span className="hidden md:inline">Points</span>
              <span className="md:hidden">Pts</span>
            </TableHead>
            {/* CHANGE - abbreviated */}
            <TableHead align="center" className="w-10 md:w-14">
              <span className="hidden md:inline">Chg</span>
              <span className="md:hidden">±</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry, index) => {
            // Phase 2: 하이라이트 체크 (대소문자 무관)
            const shouldHighlight = isHighlighted
              ? isHighlighted(entry.username.toLowerCase())
              : highlightedUsername === entry.username.toLowerCase();

            return (
              <CumulativeLeaderboardRow
                key={`leaderboard-${entry.userId}-rank-${entry.rank}-idx-${index}`}
                entry={entry}
                showXUrl={showXUrl}
                isHighlighted={shouldHighlight}
              />
            );
          })}
        </TableBody>
      </Table>
    );
  }
);

CumulativeLeaderboardTable.displayName = "CumulativeLeaderboardTable";

export default CumulativeLeaderboardTable;
