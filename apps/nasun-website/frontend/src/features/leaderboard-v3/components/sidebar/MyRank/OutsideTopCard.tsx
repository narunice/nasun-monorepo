import { Trophy, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MyRankData } from "../../../types";

interface OutsideTopCardProps {
  data: MyRankData;
}

export function OutsideTopCard({ data }: OutsideTopCardProps) {
  const { t } = useTranslation("leaderboard");

  return (
    <div className="p-5 bg-gradient-to-br from-nasun-c4/10 via-nasun-c5/10 to-nasun-c4/15 border border-nasun-c4/30 rounded-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-nasun-c4/20 rounded-lg">
            <Trophy className="w-4 h-4 text-nasun-white/50" />
          </div>
          <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">{t("v3.myRank.title")}</h4>
        </div>
      </div>

      {/* Rank Display */}
      <div className="flex items-center gap-4 mb-4">
        {/* Profile Image */}
        {data.profileImageUrl ? (
          <img
            src={data.profileImageUrl}
            alt={data.displayName || data.originalUsername || data.username}
            className="w-14 h-14 rounded-2xl border-2 border-nasun-c4/30"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.remove("hidden");
            }}
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-nasun-c4/30 flex items-center justify-center border-2 border-nasun-c4/30">
            <User className="w-6 h-6 text-nasun-white/40" />
          </div>
        )}
        {/* Hidden fallback (shown on image error) */}
        <div className="hidden">
          <div className="w-14 h-14 rounded-2xl bg-nasun-c4/30 flex items-center justify-center border-2 border-nasun-c4/30">
            <User className="w-6 h-6 text-nasun-white/40" />
          </div>
        </div>

        {/* Rank & Score */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-nasun-white/40">Chart Out</span>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div>
        <div className="font-medium text-nasun-white text-sm">
          {data.displayName || data.originalUsername || data.username}
        </div>
        <div className="text-xs text-nasun-white/50">
          @{data.originalUsername || data.username}
        </div>
      </div>
    </div>
  );
}
