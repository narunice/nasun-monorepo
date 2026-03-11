import { useTranslation } from "react-i18next";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NotRankedCardProps {
  username?: string;
  originalUsername?: string;
}

export function NotRankedCard({ username, originalUsername }: NotRankedCardProps) {
  const { t } = useTranslation("leaderboard");
  const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";

  return (
    <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-nasun-c4/30 rounded-lg">
          <User className="w-5 h-5 text-nasun-white/60" />
        </div>
        <div>
          <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">
            {t("v3.myRank.notRanked")}
          </h4>
          {(originalUsername || username) && (
            <p className="text-xs text-nasun-white/50 mt-0.5">
              @{originalUsername || username}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-nasun-white/50 mb-3">{t("v3.myRank.notRankedDesc")}</p>
      <Button variant="c4" size="sm" className="w-full text-xs" asChild>
        <a href={`https://x.com/${targetAccount}`} target="_blank" rel="noopener noreferrer">
          {t("v3.myRank.viewOnX", { handle: targetAccount })}
        </a>
      </Button>
    </div>
  );
}
