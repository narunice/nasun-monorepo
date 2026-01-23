import { useRef } from "react";
import { Trophy, User, Eye, Download, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RankChangeIndicatorV3 } from "../../RankChangeIndicatorV3";
import { useRankedActions } from "../../../hooks/useRankedActions";
import { useImageGenerator } from "../../../hooks/useImageGenerator";
import type { MyRankData } from "../../../types";

interface RankedCardProps {
  data: MyRankData;
  seasonId?: string;
}

export function RankedCard({ data, seasonId }: RankedCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const { handleViewRank, handleShareToX, handleCopyLink } = useRankedActions(seasonId, data);
  const { isGenerating, generateAndDownload } = useImageGenerator();

  const handleDownload = () => {
    generateAndDownload(
      cardRef.current,
      `nasun-rank-${data?.originalUsername || data?.username}-${data?.rank}.png`
    );
  };

  return (
    <div
      ref={cardRef}
      className="p-5 bg-gradient-to-br from-nasun-c3/20 via-nasun-c5/20 to-nasun-c4/30 border border-nasun-c3/30 rounded-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-nasun-c3/20 rounded-lg">
            <Trophy className="w-4 h-4 text-nasun-c3" />
          </div>
          <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">My Rank</h4>
        </div>
        <RankChangeIndicatorV3 rankChange={data.rankChange} />
      </div>

      {/* Rank Display */}
      <div className="flex items-center gap-4 mb-4">
        {/* Profile Image */}
        {data.profileImageUrl ? (
          <img
            src={data.profileImageUrl}
            alt={data.displayName || data.originalUsername || data.username}
            className="w-14 h-14 rounded-2xl border-2 border-nasun-c3/50"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-nasun-c4/30 flex items-center justify-center border-2 border-nasun-c3/30">
            <User className="w-6 h-6 text-nasun-white/40" />
          </div>
        )}

        {/* Rank & Score */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-nasun-c3">#{data.rank}</span>
            {data.totalUsers && (
              <span className="text-xs text-nasun-white/40">/ {data.totalUsers}</span>
            )}
          </div>
          <div className="text-sm text-nasun-white/60">{data.userScore?.toFixed(2)} score</div>
        </div>
      </div>

      {/* User Info */}
      <div className="pt-3 border-t border-white/10">
        <div className="font-medium text-nasun-white text-sm">
          {data.displayName || data.originalUsername || data.username}
        </div>
        <div className="text-xs text-nasun-white/50">
          @{data.originalUsername || data.username}
        </div>
      </div>

      {/* Share Actions */}
      <div className="pt-3 border-t border-white/10 mt-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outlineC1" size="sm" onClick={handleViewRank} className="">
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            View
          </Button>
          <Button variant="c1" size="sm" onClick={handleShareToX} className="">
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share
          </Button>
          <Button variant="outlineC1" size="sm" onClick={handleCopyLink} className="">
            <Link className="w-3.5 h-3.5 mr-1.5" />
            Copy
          </Button>
          <Button
            variant="outlineC1"
            size="sm"
            onClick={handleDownload}
            disabled={isGeneratingImage}
            className=""
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {isGeneratingImage ? "..." : "Image"}
          </Button>
        </div>
      </div>
    </div>
  );
}
