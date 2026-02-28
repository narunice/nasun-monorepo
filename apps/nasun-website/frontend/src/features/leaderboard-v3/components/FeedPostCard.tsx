/**
 * FeedPostCard Component
 *
 * Displays a single featured post using react-tweet for authentic X look & feel.
 */

import { useTranslation } from "react-i18next";
import { Tweet } from "react-tweet";
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
    label: "ranker",
    color: "text-yellow-400",
    bgColor: "bg-yellow-400/10",
    borderColor: "border-yellow-400/20",
  },
  "rank-2": {
    icon: "🥈",
    label: "ranker",
    color: "text-gray-300",
    bgColor: "bg-gray-300/10",
    borderColor: "border-gray-300/20",
  },
  "rank-3": {
    icon: "🥉",
    label: "ranker",
    color: "text-orange-400",
    bgColor: "bg-orange-400/10",
    borderColor: "border-orange-400/20",
  },
  "climber-1": {
    icon: "🚀",
    label: "climber",
    color: "text-nasun-c7",
    bgColor: "bg-nasun-c7/10",
    borderColor: "border-nasun-c7/20",
  },
  "climber-2": {
    icon: "🚀",
    label: "climber",
    color: "text-nasun-c7",
    bgColor: "bg-nasun-c7/10",
    borderColor: "border-nasun-c7/20",
  },
  "climber-3": {
    icon: "🚀",
    label: "climber",
    color: "text-nasun-c7",
    bgColor: "bg-nasun-c7/10",
    borderColor: "border-nasun-c7/20",
  },
};

export function FeedPostCard({ item }: FeedPostCardProps) {
  const { t } = useTranslation("leaderboard");
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
      {/* Tweet Embed */}
      <div className="w-full nasun-tweet-container" data-theme="dark">
        <Tweet id={tweetId} />
      </div>

      {/* Badge Indicator - Next to X icon */}
      <div className="absolute top-4 right-12 z-10">
        <div
          className={`
          flex items-center gap-1 px-2 py-0.5 rounded-full border
          ${badgeConfig.bgColor} ${badgeConfig.borderColor}
        `}
        >
          <span className="text-xs">{badgeConfig.icon}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${badgeConfig.color}`}>
            {badgeConfig.label === "ranker" ? t("v3.feed.ranker") : t("v3.feed.climber")}
          </span>
        </div>
      </div>

      {/* Override react-tweet internal styles - dark subtle styling */}
      <style>{`
        .nasun-tweet-container .react-tweet-theme {
          --tweet-container-background: transparent;
          --tweet-color-blue-primary: rgb(29, 155, 240);
          --tweet-color-hover: rgba(255, 255, 255, 0.1);
          --tweet-body-font-size: 16px;
          --tweet-body-line-height: 1.4;
          /* Control main tweet container border-radius */
          --tweet-container-border-radius: 2px;
          --tweet-border-radius: 2px;
          /* Critical: Set tweet-border to none - this variable is used by quoted-tweet-container.module.css */
          --tweet-border: none;
          --tweet-quoted-container-border: none;
          --tweet-quoted-border: none;
          --tweet-quoted-bg-color: rgba(15, 15, 25, 0.6);
          --tweet-quoted-bg-color-hover: rgba(15, 15, 15, 0.6);
          margin: 0 !important;
        }

        /* Dark subtle card styling - target react-tweet wrapper and article */
        .nasun-tweet-container .react-tweet-theme,
        .nasun-tweet-container > div {
          border-radius: 2px !important; /* rounded-md (6px) */
          overflow: hidden !important;
        }

        .nasun-tweet-container .react-tweet-theme > article,
        .nasun-tweet-container > div > article {
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          background: rgba(30, 30, 30, 0.9) !important;
          border-radius: 2px !important; /* rounded-md (6px) */
          backdrop-filter: blur(8px);
          margin: 0 !important;
          overflow: hidden !important; /* Clip children to respect border-radius */
        }

        /* Target the quoted tweet container div - apply rounded-lg (8px) */
        /* Using :has() to target parent div that contains the quoted article */
        .nasun-tweet-container article div:has(> article),
        .nasun-tweet-container article div:has(> article):hover,
        .nasun-tweet-container article div:has(> article):focus {
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          border-radius: 0.5rem !important; /* rounded-lg (8px) */
          background: rgba(15, 15, 15, 0.6) !important;
          box-shadow: none !important;
          outline: none !important;
          transition: none !important;
          overflow: hidden !important;
        }

        /* Reset borders on most elements, but EXCLUDE quoted tweet container */
        .nasun-tweet-container article > *:not(:has(article)),
        .nasun-tweet-container article > *:not(:has(article)):hover,
        .nasun-tweet-container article > *:not(:has(article)):focus {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }

        /* Quoted tweet article - transparent background as parent handles it */
        .nasun-tweet-container article article,
        .nasun-tweet-container article article:hover,
        .nasun-tweet-container article article:focus {
          border: none !important;
          background: transparent !important;
          border-radius: 0.5rem !important; /* Match parent rounded-lg */
          margin: 0 !important;
          outline: none !important;
          box-shadow: none !important;
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
