/**
 * FeedPostCard Component
 *
 * Displays a single featured post using react-tweet for authentic X look & feel.
 */

import { Tweet } from "react-tweet";
import { OuterBox } from "@/components/ui/OuterBox";
import type { FeaturedFeedItem, BadgeType } from "../types";

interface FeedPostCardProps {
  item: FeaturedFeedItem;
}

const BADGE_CONFIG: Record<
  BadgeType,
  { icon: string; label: string; color: string; bgColor: string; borderColor: string }
> = {
  "rank-1": {
    icon: "🥇",
    label: "Rank 1",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/20",
  },
  "rank-2": {
    icon: "🥈",
    label: "Rank 2",
    color: "text-gray-300",
    bgColor: "bg-gray-300/10",
    borderColor: "border-gray-300/20",
  },
  "rank-3": {
    icon: "🥉",
    label: "Rank 3",
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
    borderColor: "border-orange-400/20",
  },
  "climber-1": {
    icon: "🚀",
    label: "Top Climber",
    color: "text-nasun-c3",
    bgColor: "bg-nasun-c3/10",
    borderColor: "border-nasun-c3/20",
  },
  "climber-2": {
    icon: "🚀",
    label: "Top Climber",
    color: "text-nasun-c3",
    bgColor: "bg-nasun-c3/10",
    borderColor: "border-nasun-c3/20",
  },
  "climber-3": {
    icon: "🚀",
    label: "Top Climber",
    color: "text-nasun-c3",
    bgColor: "bg-nasun-c3/10",
    borderColor: "border-nasun-c3/20",
  },
};

export function FeedPostCard({ item }: FeedPostCardProps) {
  const { author, content } = item;

  // Extract tweet ID from URL
  const getTweetId = (url: string) => {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  };

  const tweetId = getTweetId(content.postUrl);

  if (!tweetId) {
    return null;
  }

  // Determine primary badge (Rank takes precedence over Climber)
  const primaryBadgeType = author.badges.find((b) => b.startsWith("rank")) || author.badges[0];
  const badgeConfig = BADGE_CONFIG[primaryBadgeType];

  return (
    <div className="relative">
      {/* Tweet Embed - OuterBox provides w1 styling */}
      <OuterBox color="w1" padding="sm" className="nasun-tweet-container p-0">
        <Tweet id={tweetId} />
      </OuterBox>

      {/* Badge Indicator - Next to X icon */}
      <div className="absolute top-6 right-8 z-10">
        <div
          className={`
          flex items-center gap-1 px-2 py-0.5 rounded-full border
          ${badgeConfig.bgColor} ${badgeConfig.borderColor}
        `}
        >
          <span className="text-xs">{badgeConfig.icon}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${badgeConfig.color}`}>
            {badgeConfig.label}
          </span>
        </div>
      </div>

      {/* Override react-tweet internal styles */}
      <style>{`
        .nasun-tweet-container .react-tweet-theme {
          --tweet-container-background: transparent;
          --tweet-color-blue-primary: rgb(29, 155, 240);
          --tweet-color-hover: rgba(255, 255, 255, 0.05);
          --tweet-body-font-size: 14px;
          --tweet-body-line-height: 1.4;
        }

        /* Remove react-tweet's default article border/bg (OuterBox handles it) */
        .nasun-tweet-container article {
          border: none !important;
          background: transparent !important;
          border-radius: 0 !important;
        }

        /* Tweet body text size */
        .nasun-tweet-container [data-testid="tweetText"],
        .nasun-tweet-container [data-testid="tweetText"] * {
          font-size: 14px !important;
          line-height: 1.4 !important;
        }
      `}</style>
    </div>
  );
}
