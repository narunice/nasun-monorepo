/**
 * MyRankCardV3 Component
 *
 * Displays the logged-in user's rank in the current season.
 * Supports states: not logged in, no Twitter, not ranked, ranked.
 * Includes share actions: View, Share on X, Copy Link, Download Image.
 */

import { memo, useRef, useState } from "react";
import { Trophy, Link2, User, Eye, Link, Download } from "lucide-react";
import { toast } from "react-toastify";
import { useSearchParams } from "react-router-dom";
import { useMyRank } from "../hooks/useMyRank";
import { useAuth } from "@/features/auth";
import { Button } from "@/components/ui/button";
import type { RankChange } from "../types";

interface MyRankCardV3Props {
  seasonId?: string;
}

function RankChangeIndicator({ rankChange }: { rankChange?: RankChange }) {
  if (!rankChange || rankChange.direction === "same") {
    return <span className="text-nasun-white/40">-</span>;
  }

  const { direction, amount } = rankChange;

  if (direction === "up") {
    return <span className="text-green-400 font-semibold">▲ {amount}</span>;
  }

  if (direction === "down") {
    return <span className="text-red-400 font-semibold">▼ {amount}</span>;
  }

  if (direction === "new") {
    return (
      <span className="text-green-400 font-semibold text-xs uppercase tracking-wider">NEW</span>
    );
  }

  return null;
}

function MyRankCardV3Component({ seasonId }: MyRankCardV3Props) {
  const { data, isLoading, isAuthenticated } = useMyRank(seasonId);
  const { signInWithTwitter } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Generate share URL
  const getShareUrl = (): string => {
    const baseUrl = window.location.origin;
    const path = "/leaderboard";
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
    const seasonName = seasonId || "current";
    const message = `I'm ranked #${rank} on @Nasun_io ${seasonName} Leaderboard!`;
    const url = getShareUrl();
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`;
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

  // Download card as image using html2canvas
  const handleDownloadImage = async () => {
    if (!cardRef.current || isGeneratingImage) return;

    setIsGeneratingImage(true);
    try {
      const html2canvas = await import("html2canvas").then((m) => m.default);
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "#191615",
        scale: 2,
        useCORS: true,
        allowTaint: false,
        imageTimeout: 15000,
      });

      const link = document.createElement("a");
      link.download = `nasun-rank-${data?.originalUsername || data?.username}-${data?.rank}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Image downloaded!");
    } catch (error) {
      console.error("Failed to generate image:", error);
      toast.error("Failed to download image");
    } finally {
      setIsGeneratingImage(false);
    }
  };

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
    return (
      <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-nasun-c3/20 rounded-lg">
            <Trophy className="w-5 h-5 text-nasun-c3" />
          </div>
          <div>
            <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">My Rank</h4>
            <p className="text-xs text-nasun-white/50 mt-0.5">Sign in to see your ranking</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={signInWithTwitter} variant="c3" size="sm" className="flex-1 text-xs">
            Sign in with
            <svg className="w-3.5 h-3.5 ml-1.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </Button>
        </div>
      </div>
    );
  }

  // No Twitter connected
  if (data?.status === "no_twitter") {
    return (
      <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-yellow-500/20 rounded-lg">
            <Link2 className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">
              Connect X Account
            </h4>
            <p className="text-xs text-nasun-white/50 mt-0.5">Link your X to track your rank</p>
          </div>
        </div>
        <Button onClick={signInWithTwitter} variant="c3" size="sm" className="w-full text-xs">
          <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Connect X Account
        </Button>
      </div>
    );
  }

  // Not ranked
  if (data?.status === "not_ranked") {
    const targetAccount = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";

    return (
      <div className="p-5 bg-gradient-to-br from-nasun-c5/20 to-nasun-c4/30 border border-white/10 rounded-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-nasun-c4/30 rounded-lg">
            <User className="w-5 h-5 text-nasun-white/60" />
          </div>
          <div>
            <h4 className="font-bold text-nasun-white text-sm uppercase tracking-tight">
              Not Ranked Yet
            </h4>
            <p className="text-xs text-nasun-white/50 mt-0.5">
              @{data.username || data.originalUsername}
            </p>
          </div>
        </div>
        <p className="text-xs text-nasun-white/50 mb-3">Engage with Nasun content to get ranked!</p>
        <Button variant="c4" size="sm" className="w-full text-xs" asChild>
          <a href={`https://x.com/${targetAccount}`} target="_blank" rel="noopener noreferrer">
            View @{targetAccount} on X
          </a>
        </Button>
      </div>
    );
  }

  // Error state
  if (data?.status === "error") {
    return (
      <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-s,">
        <p className="text-sm text-red-400 text-center">Failed to load rank</p>
      </div>
    );
  }

  // Ranked state
  if (data?.status === "ranked" && data.rank !== undefined) {
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
          <RankChangeIndicator rankChange={data.rankChange} />
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
              onClick={handleDownloadImage}
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

  return null;
}

export const MyRankCardV3 = memo(MyRankCardV3Component);
