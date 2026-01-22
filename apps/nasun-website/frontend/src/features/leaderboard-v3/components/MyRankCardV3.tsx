/**
 * MyRankCardV3 Component
 *
 * Displays the logged-in user's rank in the current season.
 * Supports states: not logged in, no Twitter, not ranked, ranked.
 */

import { memo } from "react";
import { Trophy, Link2, User } from "lucide-react";
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
  const { signInWithTwitter, signInWithGoogle } = useAuth();

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
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X
          </Button>
          <Button onClick={signInWithGoogle} variant="c4" size="sm" className="flex-1 text-xs">
            <svg className="w-3.5 h-3.5 mr-1.5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Google
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
      <div className="p-5 bg-gradient-to-br from-nasun-c3/20 via-nasun-c5/20 to-nasun-c4/30 border border-nasun-c3/30 rounded-sm">
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
      </div>
    );
  }

  return null;
}

export const MyRankCardV3 = memo(MyRankCardV3Component);
