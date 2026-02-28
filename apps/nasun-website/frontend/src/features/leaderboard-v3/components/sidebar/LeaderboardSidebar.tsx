import { useTranslation } from "react-i18next";
import { MyRankCardV3 } from "./MyRank";
import { NasunContentFeed } from "../NasunContentFeed";

interface LeaderboardSidebarProps {
  seasonId?: string;
}

export function LeaderboardSidebar({ seasonId }: LeaderboardSidebarProps) {
  const { t } = useTranslation("leaderboard");
  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Desktop: My Rank Card in sidebar */}
      {seasonId && (
        <div className="hidden md:block flex-shrink-0">
          <MyRankCardV3 seasonId={seasonId} />
        </div>
      )}
      {/* Featured Content Feed - stretches to fill remaining grid cell height */}
      <div className="relative flex-1 min-h-0">
        <div className="md:absolute md:inset-0 md:overflow-hidden">
          <NasunContentFeed seasonId={seasonId} />
        </div>
        {/* Gradient fade + label (desktop only, where feed is constrained) */}
        <div className="hidden md:block absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-nasun-black from-20% via-nasun-black/95 via-45% to-transparent pointer-events-none z-10" />
        <div className="hidden md:block absolute bottom-1 left-0 right-0 z-20 px-1 text-[10px] text-nasun-white/40 uppercase tracking-widest text-center">
          {t("v3.feed.subtitle")}
        </div>
      </div>
    </div>
  );
}
