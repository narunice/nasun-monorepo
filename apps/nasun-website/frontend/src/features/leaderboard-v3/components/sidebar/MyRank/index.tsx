import { memo } from "react";
import { useMyRank } from "../../../hooks/useMyRank";
import { RankedCard } from "./RankedCard";
import { ConnectTwitterCard } from "./ConnectTwitterCard";
import { NotRankedCard } from "./NotRankedCard";
import { ErrorCard } from "./ErrorCard";
import { NotLoggedInCard } from "./NotLoggedInCard";

interface MyRankCardV3Props {
  seasonId?: string;
}

function MyRankCardV3Component({ seasonId }: MyRankCardV3Props) {
  const { data, isLoading, isAuthenticated } = useMyRank(seasonId);

  // Loading state
  if (isLoading) {
    return (
      <div className="p-4 bg-nasun-c4/20 border border-white/10 rounded-sm animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-nasun-c4/30 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-20 bg-nasun-c4/30 rounded" />
            <div className="h-3 w-32 bg-nasun-c4/30 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!isAuthenticated) {
    return <NotLoggedInCard />;
  }

  // No Twitter connected
  if (data?.status === "no_twitter") {
    return <ConnectTwitterCard />;
  }

  // Not ranked
  if (data?.status === "not_ranked") {
    return <NotRankedCard username={data.username} originalUsername={data.originalUsername} />;
  }

  // Error state
  if (data?.status === "error") {
    return <ErrorCard />;
  }

  // Ranked state
  if (data?.status === "ranked" && data.rank !== undefined) {
    return <RankedCard data={data} seasonId={seasonId} />;
  }

  return null;
}

export const MyRankCardV3 = memo(MyRankCardV3Component);
