import React, { memo } from "react";
import { CumulativeLeaderboardEntry } from "../types";
import RankBadge from "./RankBadge";
import RankChangeIndicator from "./RankChangeIndicator";
import UserProfile from "./UserProfile";
import RegisteredMemberBadge from "./RegisteredMemberBadge";
import { getLanguageName } from "@/utils/communityLanguage";
import { CheckCircle } from "lucide-react";
import { TableRow } from "../../../ui/table/TableRow";
import { TableCell } from "../../../ui/table/TableCell";

interface CumulativeLeaderboardRowProps {
  entry: CumulativeLeaderboardEntry;
  showXUrl?: boolean;
  /** Phase 2: 하이라이트 여부 */
  isHighlighted?: boolean;
}

const CumulativeLeaderboardRow: React.FC<CumulativeLeaderboardRowProps> = memo(
  ({ entry, showXUrl = true, isHighlighted = false }) => {
    // Phase 2: 하이라이트 스타일 추가
    const rowClassName = isHighlighted
      ? "bg-yellow-900/30 border-l-4 border-yellow-500 animate-pulse-subtle scale-[1.02] shadow-lg"
      : "hover:bg-black hover:scale-[1.01] hover:shadow-sm";

    // 팔로워 수 포맷팅 함수
    const formatFollowersCount = (count: number): string => {
      if (count >= 1000000) {
        return `${(count / 1000000).toFixed(1)}M`;
      } else if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
      } else {
        return count.toLocaleString("ko-KR");
      }
    };

    const ScoreDisplay = ({ value }: { value: number }) => {
      return <span className="font-medium text-nasun-white">{(value || 0).toLocaleString()}</span>;
    };

    // 팔로워 수 표시 컴포넌트
    const FollowersDisplay = ({ count }: { count?: number | null }) => {
      if (!count || count === 0) {
        return <span className="text-gray-400/50">-</span>;
      }

      return <span className="font-medium text-nasun-white">{formatFollowersCount(count)}</span>;
    };

    return (
      <TableRow variant="c3" className={rowClassName} data-username={entry.username.toLowerCase()}>
        {/* 순위 */}
        <TableCell align="center">
          <RankBadge rank={entry.rank} />
        </TableCell>

        {/* 사용자 정보 */}
        <TableCell align="left">
          <div className="flex items-center gap-2">
            <UserProfile
              displayName={entry.displayName}
              username={entry.username}
              profileImageUrl={entry.profileImageUrl}
              xUrl={showXUrl ? entry.xUrl || `https://x.com/${entry.username}` : undefined}
            />
            {/* 등록 회원 뱃지 */}
            {entry.isRegisteredMember && (
              <RegisteredMemberBadge size={16} className="flex-shrink-0" />
            )}
          </div>
        </TableCell>

        {/* Community Member */}
        <TableCell align="center">
          {entry.isCommunityMember ? (
            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
          ) : (
            <span className="font-medium text-gray-500">-</span>
          )}
        </TableCell>

        {/* 언어 */}
        <TableCell align="center">
          <span className="text-nasun-white">{getLanguageName(entry.dominantLanguage, "en")}</span>
        </TableCell>

        {/* 팔로워 수 */}
        <TableCell align="center">
          <FollowersDisplay count={entry.followersCount} />
        </TableCell>

        {/* 총점 */}
        <TableCell align="center">
          <span className="!font-extrabold text-white">
            {(entry.finalScore || 0).toLocaleString()}
          </span>
        </TableCell>

        {/* 순위 변동 */}
        <TableCell align="center">
          <RankChangeIndicator rankChange={entry.rankChange} variant="short" />
        </TableCell>
      </TableRow>
    );
  }
);

CumulativeLeaderboardRow.displayName = "CumulativeLeaderboardRow";

export default CumulativeLeaderboardRow;
