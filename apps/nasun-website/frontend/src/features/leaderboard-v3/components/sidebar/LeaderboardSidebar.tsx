import { UserSearchBoxV3 } from "../UserSearchBoxV3";
import { MyRankCardV3 } from "./MyRank";
import { NasunContentFeed } from "../NasunContentFeed";

interface LeaderboardSidebarProps {
  seasonId?: string;
  onUserSelect: (username: string, rank?: number) => void;
  maxHeight: number;
}

export function LeaderboardSidebar({ seasonId, onUserSelect, maxHeight }: LeaderboardSidebarProps) {
  return (
    <div
      className="flex flex-col gap-6"
      style={{ height: maxHeight > 0 ? `${maxHeight}px` : undefined }}
    >
      {/* User Search */}
      <div className="flex-shrink-0">
        <UserSearchBoxV3
          seasonId={seasonId}
          onUserSelect={onUserSelect}
          placeholder="Search user..."
        />
      </div>
      {/* Desktop: My Rank Card in sidebar */}
      {seasonId && (
        <div className="hidden md:block flex-shrink-0">
          <MyRankCardV3 seasonId={seasonId} />
        </div>
      )}
      {/* Featured Content Feed - constrained to remaining height */}
      <div className={`relative flex-1 ${maxHeight > 0 ? 'min-h-0' : ''}`}>
        <div className={maxHeight > 0 ? 'absolute inset-0 overflow-hidden' : ''}>
          <NasunContentFeed seasonId={seasonId} />
        </div>
        {maxHeight > 0 && (
          <>
            <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-nasun-black via-nasun-black/90 via-40% to-transparent pointer-events-none z-10" />
            <div className="absolute bottom-1 left-0 right-0 z-20 px-1 text-[10px] text-nasun-white/40 uppercase tracking-widest text-center">
              Recent posts from top rankers and climbers
            </div>
          </>
        )}
      </div>
    </div>
  );
}
