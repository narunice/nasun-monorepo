import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, User, Eye } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { RankChangeIndicatorV3 } from "../../RankChangeIndicatorV3";
import { useRankedActions } from "../../../hooks/useRankedActions";
import type { MyRankData } from "../../../types";

interface RankedCardProps {
  data: MyRankData;
  seasonId?: string;
}

export function RankedCard({ data, seasonId }: RankedCardProps) {
  const { t } = useTranslation("leaderboard");
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);
  const { handleViewRank, handleShareToX } = useRankedActions(seasonId, data);

  const handleShare = async () => {
    if (!cardRef.current || isSharing) return;
    setIsSharing(true);
    try {
      const html2canvas = await import("html2canvas").then((m) => m.default);
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#191615",
        scale: 2,
        useCORS: true,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.info(t("v3.myRank.cardCopied"));
      }
    } catch (error) {
      console.error("Failed to copy card image:", error);
    } finally {
      setIsSharing(false);
    }
    handleShareToX();
  };

  return (
    <div>
      <div
        ref={cardRef}
        className="p-5 bg-gradient-to-br from-nasun-c7/20 via-nasun-c5/20 to-nasun-c4/30 border border-nasun-c7/30 rounded-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-nasun-c7/20 rounded-lg">
              <Trophy className="w-4 h-4 text-nasun-c7" />
            </div>
            <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">{t("v3.myRank.title")}</h4>
          </div>
          <RankChangeIndicatorV3
            direction={data.rankChange?.direction ?? "same"}
            amount={data.rankChange?.amount ?? 0}
          />
        </div>

        {/* Rank Display */}
        <div className="flex items-center gap-4 mb-4">
          {/* Profile Image */}
          {data.profileImageUrl ? (
            <img
              src={data.profileImageUrl}
              alt={data.displayName || data.originalUsername || data.username}
              className="w-14 h-14 rounded-2xl border-2 border-nasun-c7/50"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) fallback.classList.remove("hidden");
              }}
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-nasun-c4/30 flex items-center justify-center border-2 border-nasun-c7/30">
              <User className="w-6 h-6 text-nasun-white/40" />
            </div>
          )}
          {/* Hidden fallback (shown on image error) */}
          <div className="hidden">
            <div className="w-14 h-14 rounded-2xl bg-nasun-c4/30 flex items-center justify-center border-2 border-nasun-c7/30">
              <User className="w-6 h-6 text-nasun-white/40" />
            </div>
          </div>

          {/* Rank & Score */}
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-nasun-c7">#{data.rank}</span>
            </div>
            <div className="text-sm text-nasun-white/60">{data.userScore?.toFixed(3)} {t("v3.myRank.score")}</div>
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

      {/* Share Actions - outside cardRef for clean image capture */}
      <div className="pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outlineC1" size="sm" onClick={handleViewRank}>
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            {t("v3.myRank.view")}
          </Button>
          <Button variant="c1" size="sm" onClick={handleShare} disabled={isSharing}>
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            {t("v3.myRank.share")}
          </Button>
        </div>
      </div>
    </div>
  );
}
