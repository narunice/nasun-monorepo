import { toast } from "react-toastify";
import { useSearchParams } from "react-router-dom";
import type { MyRankData } from "../types";

export function useRankedActions(seasonId: string | undefined, data: MyRankData | undefined) {
  const [, setSearchParams] = useSearchParams();

  // Generate share URL
  const getShareUrl = (): string => {
    const baseUrl = window.location.origin;
    const path = "/wave1/leaderboard";
    const params = new URLSearchParams();
    if (seasonId) params.append("seasonId", seasonId);
    if (data?.originalUsername || data?.username) {
      params.append("username", data.originalUsername || data.username || "");
    }
    return `${baseUrl}${path}?${params.toString()}`;
  };

  // View My Rank - scroll to user's row in table
  const handleViewRank = () => {
    const username = data?.originalUsername || data?.username;
    if (username) {
      setSearchParams((prev) => {
        prev.set("username", username);
        return prev;
      });
    }
  };

  // Share to X/Twitter
  const handleShareToX = () => {
    const rank = data?.rank;
    if (!rank) return;
    const seasonName = seasonId || "current";
    const message = `I'm ranked #${rank} on @Nasun_io ${seasonName} Leaderboard!`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;
    window.open(twitterUrl, "_blank", "width=550,height=420");
  };

  // Copy share link to clipboard
  const handleCopyLink = async () => {
    const url = getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast.error("Failed to copy link");
    }
  };

  return {
    handleViewRank,
    handleShareToX,
    handleCopyLink,
  };
}
