import React, { memo } from 'react';
import { FaCrown } from 'react-icons/fa';
import { RankPosition } from '@/types';

interface RankBadgeProps {
  rank: RankPosition;
}

// 순위별 왕관 색상
const CROWN_COLORS: Record<1 | 2 | 3, string> = {
  1: 'text-yellow-400',   // 금색
  2: 'text-gray-300',     // 은색
  3: 'text-orange-400',   // 동색
};

const RankBadge: React.FC<RankBadgeProps> = memo(({ rank }) => {
  const isTopThree = rank === 1 || rank === 2 || rank === 3;
  const crownColor = isTopThree ? CROWN_COLORS[rank as 1 | 2 | 3] : '';

  return (
    <div className="flex items-center justify-center">
      {/* 숫자: 고정 너비로 가운데 정렬 */}
      <span className="w-6 text-center !font-extrabold text-white">
        {rank}
      </span>
      {/* 왕관 영역: 항상 고정 너비 확보 (정렬 유지) */}
      <span className="w-5 flex items-center">
        {isTopThree && <FaCrown className={`w-4 h-4 ${crownColor}`} />}
      </span>
    </div>
  );
});

RankBadge.displayName = 'RankBadge';

export default RankBadge;