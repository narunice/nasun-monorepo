/**
 * 🆕 Rank History Stats Card Component
 *
 * @description
 * 사용자의 랭킹 통계 정보를 표시하는 카드 컴포넌트입니다.
 * Best Rank, Average Rank, 프로필 정보를 표시합니다.
 *
 * @author Claude Code
 * @date 2025-11-12
 */

import { useTranslation } from "react-i18next";
import { CumulativePeriod } from "../types/leaderboard";

export interface RankHistoryStatsCardProps {
  /** 최고 순위 */
  bestRank: number;
  /** 평균 순위 */
  averageRank: number;
  /** X 사용자명 */
  username: string;
  /** 프로필 이미지 URL */
  profileImageUrl?: string;
  /** 표시 이름 */
  displayName?: string;
  /** 리더보드 기간 */
  period: CumulativePeriod;
}

/**
 * RankHistoryStatsCard 컴포넌트
 *
 * @example
 * <RankHistoryStatsCard
 *   bestRank={5}
 *   averageRank={12}
 *   username="johndoe"
 *   profileImageUrl="https://..."
 *   period={CumulativePeriod.CUMULATIVE}
 * />
 */
export const RankHistoryStatsCard = ({
  bestRank,
  averageRank,
  username,
  profileImageUrl,
  displayName,
  period,
}: RankHistoryStatsCardProps) => {
  const { t, i18n } = useTranslation(["myAccount"]);
  const isKorean = i18n.language === "ko";

  return (
    <div className="mb-6 p-6 min-h-[210px] bg-gradient-to-r from-nasun-c4/10 to-nasun-c3/10 dark:from-nasun-c4/20 dark:to-nasun-c3/10 border border-gray-600 rounded-lg shadow-sm">
      <div className="space-y-4">
        {/* 카드 제목: 선택된 리더보드 종류 */}
        <h6 className="font-medium uppercase">
          {period === CumulativePeriod.CUMULATIVE
            ? t("rankHistory.leaderboardTitles.cumulative")
            : period === CumulativePeriod.EVENT1
              ? t("rankHistory.leaderboardTitles.event1")
              : period === CumulativePeriod.EVENT2
                ? t("rankHistory.leaderboardTitles.event2")
                : t("rankHistory.leaderboardTitles.event3")}
        </h6>

        {/* 상단: Best/Average Rank */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="font-medium uppercase tracking-wide text-nasun-c1 mb-1">
              {t("rankHistory.stats.bestRank")}
            </p>
            <p className="font-bold text-nasun-c1">{isKorean ? `${bestRank}위` : `#${bestRank}`}</p>
          </div>
          <div>
            <p className="font-medium uppercase tracking-wide text-nasun-c2 mb-1">
              {t("rankHistory.stats.averageRank")}
            </p>
            <p className="font-bold text-nasun-c2">
              {isKorean ? `${averageRank}위` : `#${averageRank}`}
            </p>
          </div>
        </div>

        {/* 하단: 프로필 정보 */}
        <div className="flex items-center gap-3 pt-4 border-t border-gray-600">
          {/* 프로필 이미지 */}
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt={displayName || username || "User"}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-nasun-c4 to-nasun-c3 flex items-center justify-center text-white font-bold">
              {username?.[0]?.toUpperCase() || "U"}
            </div>
          )}
          <div>
            <div className="font-medium text-nasun-white">{displayName || username}</div>
            <div className="text-nasun-white/70">@{username}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
