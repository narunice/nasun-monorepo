/**
 * 🆕 ClimberCardSkeleton Component
 *
 * @description
 * Top Climbers Spotlight 로딩 시 표시되는 스켈레톤 카드 컴포넌트입니다.
 * - ClimberCard와 동일한 레이아웃 유지
 * - 모든 요소를 회색 애니메이션 블록으로 표시
 * - 레이아웃 시프트 방지
 *
 * @author Claude Code
 * @date 2025-11-24
 */

import React, { memo } from "react";

export interface ClimberCardSkeletonProps {
  /** 순위 (1-5) - 메달 표시용 */
  rank: number;
}

const ClimberCardSkeleton: React.FC<ClimberCardSkeletonProps> = memo(() => {
  return (
    <div className="group relative bg-nasun-c4/10 border border-nasun-c4 rounded-xl p-4 animate-pulse">
      {/* 프로필 섹션 - 프로필 이미지만 보이고 나머지는 투명 */}
      <div className="flex items-start gap-3 mb-4 mt-2">
        <div className="flex-shrink-0 h-12 w-12 rounded-2xl bg-gray-700/30 dark:bg-gray-300/30" />
        {/* 사용자 정보 영역 (투명하게 공간만 확보) */}
        <div className="flex-1 min-w-0 space-y-2 opacity-0">
          <div className="h-5" />
          <div className="h-4" />
        </div>
      </div>

      {/* 순위 변동 섹션 (투명하게 공간만 확보) */}
      <div className="space-y-2 mb-3 opacity-0">
        <div className="h-4" />
        <div className="h-6" />
      </div>

      {/* 점수 증가 섹션 (투명하게 공간만 확보) */}
      <div className="pt-3 border-t border-transparent space-y-3 opacity-0">
        <div className="h-4" />
        <div className="h-4" />
        <div className="h-4" />
      </div>
    </div>
  );
});

ClimberCardSkeleton.displayName = "ClimberCardSkeleton";

export default ClimberCardSkeleton;
