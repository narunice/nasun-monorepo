import React from "react";
import { useTranslation } from "react-i18next";
import CumulativeLeaderboardTable from "./CumulativeLeaderboardTable";
import { CumulativeLeaderboardEntry } from "@/types";

interface LeaderboardTableSectionProps {
  entries: CumulativeLeaderboardEntry[];
  loading: boolean;
  highlightedUsername: string | null | undefined;
  isHighlighted: (username: string) => boolean;
  showXUrl?: boolean;
}

/**
 * LeaderboardTableSection - 리더보드 테이블 섹션
 *
 * @description
 * 로딩 상태, 빈 데이터 상태, 정상 테이블 렌더링을 처리하는 컴포넌트입니다.
 * CumulativeLeaderboard에서 추출되어 재사용 가능합니다.
 */
const LeaderboardTableSection: React.FC<LeaderboardTableSectionProps> = ({
  entries,
  loading,
  highlightedUsername,
  isHighlighted,
  showXUrl = true,
}) => {
  const { t } = useTranslation("leaderboard");

  return (
    <div data-leaderboard-table>
      {loading ? (
        <div className="opacity-50">
          <CumulativeLeaderboardTable entries={entries} highlightedUsername={null} />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-nasun-white/70 bg-nasun-black rounded-lg">
          <div className="font-medium mb-2">{t("states.noDataTitle")}</div>
          <div>{t("states.noDataDescription")}</div>
        </div>
      ) : (
        <CumulativeLeaderboardTable
          entries={entries}
          showXUrl={showXUrl}
          highlightedUsername={highlightedUsername}
          isHighlighted={isHighlighted}
        />
      )}
    </div>
  );
};

export default LeaderboardTableSection;
