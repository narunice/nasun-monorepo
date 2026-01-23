import { UserSearchBoxV3 } from "../UserSearchBoxV3";
import { MyRankCardV3 } from "./MyRank";
import { NasunContentFeed } from "../NasunContentFeed";
import { useStickySidebar } from "../../hooks/useStickySidebar";

interface LeaderboardSidebarProps {
  seasonId?: string;
  onUserSelect: (username: string, rank?: number) => void;
}

export function LeaderboardSidebar({ seasonId, onUserSelect }: LeaderboardSidebarProps) {
  const { rightColumnHeight, isFeedOverflowing, feedContainerRef } = useStickySidebar();

  return (
    <div
      className="md:sticky md:top-24 flex flex-col gap-6"
      style={{ maxHeight: rightColumnHeight > 0 ? `${rightColumnHeight}px` : undefined }}
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
      <div className="relative flex-1 min-h-0">
        <div ref={feedContainerRef} className="overflow-hidden h-full">
          <NasunContentFeed seasonId={seasonId} />
        </div>
        {/* Gradient fade when content overflows */}
        {isFeedOverflowing && (
          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-nasun-black to-transparent pointer-events-none" />
        )}
      </div>
    </div>
  );
}
