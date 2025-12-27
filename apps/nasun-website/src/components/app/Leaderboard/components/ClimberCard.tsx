/**
 * 🆕 ClimberCard Component
 *
 * @description
 * Top Climbers Spotlight의 개별 사용자 카드 컴포넌트입니다.
 * - 메달 시스템: 🥇(1위), 🥈(2위), 🥉(3위), 🏅(4-5위)
 * - 프로필 이미지 (폴백 처리)
 * - 순위 변동 표시 (이전 → 현재, +상승폭)
 * - 점수 증가 표시 (절대값 + 퍼센트)
 * - X 프로필 링크
 * - 다크 모드 지원
 *
 * @author Claude Code
 * @date 2025-11-22
 */

import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { TopClimberEntry } from "../types/leaderboard";
import { ArrowUp, ArrowRight, ExternalLink } from "lucide-react";

export interface ClimberCardProps {
  /** Top Climber 데이터 */
  climber: TopClimberEntry;
  /** 순위 (1-5) */
  rank: number;
  /** 리더보드 테이블로 점프하는 핸들러 */
  onViewInLeaderboard?: (username: string, rank: number) => void;
}

const ClimberCard: React.FC<ClimberCardProps> = memo(({ climber, rank, onViewInLeaderboard }) => {
  const { t } = useTranslation("leaderboard");
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // 메달 이모지 (1=🥇, 2=🥈, 3=🥉, 4-5=없음)
  const getMedal = (rank: number): string => {
    switch (rank) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return "";
    }
  };

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
  }, []);

  const handleProfileClick = useCallback(() => {
    window.open(climber.xUrl, "_blank", "noopener,noreferrer");
  }, [climber.xUrl]);

  const handleViewInLeaderboard = useCallback(() => {
    onViewInLeaderboard?.(climber.username, climber.currentRank);
  }, [onViewInLeaderboard, climber.username, climber.currentRank]);

  return (
    <div className="group relative bg-nasun-c4/10  border border-nasun-c4/50 rounded-xl p-4 hover:shadow-lg hover:scale-[1.01] transition-all duration-200">
      {/* 메달 배지 (왼쪽 상단, 1-3위만 표시) */}
      {rank <= 3 && (
        <div className="absolute -top-3 -left-3 z-10 text-2xl xl:text-3xl">{getMedal(rank)}</div>
      )}

      {/* 프로필 섹션 */}
      <div className="flex items-start gap-3 mb-4 mt-2">
        {/* 프로필 이미지 */}
        <div className="flex-shrink-0 relative">
          {climber.profileImageUrl && !imageError ? (
            <>
              {/* 로딩 중 플레이스홀더 */}
              {!imageLoaded && (
                <div className="absolute inset-0 h-12 w-12 rounded-2xl bg-gray-700 dark:bg-gray-300 animate-pulse flex items-center justify-center">
                  <span className="text-gray-400 dark:text-gray-600">
                    {(climber.displayName || climber.username).charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* 실제 이미지 */}
              <img
                alt={climber.displayName || climber.username}
                src={climber.profileImageUrl}
                loading="lazy"
                width={48}
                height={48}
                className={`h-12 w-12 rounded-2xl cursor-pointer hover:opacity-80 hover:scale-105 transition-all duration-200 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                onClick={handleViewInLeaderboard}
                onError={handleImageError}
                onLoad={handleImageLoad}
                style={{
                  objectFit: "cover",
                  backgroundColor: "var(--nasun-gray)",
                }}
              />
            </>
          ) : (
            // 이미지 로딩 실패 시 폴백
            <div
              className="h-12 w-12 rounded-2xl bg-gray-700 dark:bg-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-600 dark:hover:bg-gray-400 hover:scale-105 transition-all duration-200"
              onClick={handleViewInLeaderboard}
            >
              <span className="font-medium text-nasun-white dark:text-nasun-black">
                {(climber.displayName || climber.username).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* 사용자 정보 */}
        <div className="flex-1 min-w-0">
          <p
            className="font-medium text-white truncate cursor-pointer hover:text-gray-300 transition-colors"
            onClick={handleViewInLeaderboard}
          >
            {climber.displayName || climber.username}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{climber.username}</p>
        </div>

        {/* 외부 링크 아이콘 */}
        <button
          onClick={handleProfileClick}
          className="flex-shrink-0 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Open X profile"
        >
          <ExternalLink className="w-4 h-4 text-gray-400 dark:text-gray-500" />
        </button>
      </div>

      {/* 순위 변동 섹션 */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {t("topClimbers.rankChange", "Rank Change")}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-gray-500">#{climber.previousRank}</span>
            <ArrowRight className="w-3 h-3 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-semibold text-nasun-white">#{climber.currentRank}</span>
          </div>
        </div>

        {/* 순위 상승폭 */}
        <div className="flex items-center justify-center bg-nasun-c5/80 rounded-md py-1">
          <ArrowUp className="w-4 h-4 text-green-300 mr-1" />
          <span className="font-semibold text-green-300 ">{climber.rankImprovement}</span>
          <span className="text-gray-200 ml-1">{t("topClimbers.ranks", "ranks")}</span>
        </div>
      </div>

      {/* 점수 증가 섹션 */}
      <div className="pt-3 border-t border-nasun-c4/50">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {t("topClimbers.scoreIncrease", "Score Increase")}
          </span>
          <span className="text-sm text-gray-200">+{climber.scoreIncrease.toLocaleString()}</span>
        </div>

        {/* 퍼센트 증가율 */}
        <div className="flex items-center justify-between">
          <span className="text-sm  text-gray-400">
            {t("topClimbers.percentageIncrease", "Percentage")}
          </span>
          <span className="text-sm text-gray-200">+{climber.percentageIncrease.toFixed(1)}%</span>
        </div>

        {/* 현재 점수 */}
        <div className="flex items-center justify-between">
          <span className="text-sm  text-gray-400">{t("topClimbers.currentScore", "Current")}</span>
          <span className="text-sm  text-gray-200">{climber.currentScore.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
});

ClimberCard.displayName = "ClimberCard";

export default ClimberCard;
