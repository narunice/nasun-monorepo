/**
 * FeedPostCard Component
 *
 * Displays a single featured post using react-tweet for authentic X look & feel.
 */

import { Tweet } from 'react-tweet';
import type { FeaturedFeedItem, BadgeType } from '../types';

interface FeedPostCardProps {
  item: FeaturedFeedItem;
}

const BADGE_CONFIG: Record<BadgeType, { icon: string; label: string; color: string; bgColor: string; borderColor: string }> = {
  'rank-1': { 
    icon: '🥇', 
    label: 'Rank 1', 
    color: 'text-yellow-400', 
    bgColor: 'bg-yellow-400/10',
    borderColor: 'border-yellow-400/20'
  },
  'rank-2': { 
    icon: '🥈', 
    label: 'Rank 2', 
    color: 'text-gray-300',
    bgColor: 'bg-gray-300/10',
    borderColor: 'border-gray-300/20'
  },
  'rank-3': { 
    icon: '🥉', 
    label: 'Rank 3', 
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/20'
  },
  'climber-1': { 
    icon: '🚀', 
    label: 'Top Climber', 
    color: 'text-nasun-c3',
    bgColor: 'bg-nasun-c3/10',
    borderColor: 'border-nasun-c3/20'
  },
  'climber-2': { 
    icon: '🚀', 
    label: 'Top Climber', 
    color: 'text-nasun-c3',
    bgColor: 'bg-nasun-c3/10',
    borderColor: 'border-nasun-c3/20'
  },
  'climber-3': { 
    icon: '🚀', 
    label: 'Top Climber', 
    color: 'text-nasun-c3',
    bgColor: 'bg-nasun-c3/10',
    borderColor: 'border-nasun-c3/20'
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
  const primaryBadgeType = author.badges.find(b => b.startsWith('rank')) || author.badges[0];
  const badgeConfig = BADGE_CONFIG[primaryBadgeType];

  return (
    <div className="relative flex flex-col gap-2">
      {/* Badge Indicator - Floating above or integrated nicely */}
      <div className="flex items-center gap-2 px-1">
        <div className={`
          flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border 
          ${badgeConfig.bgColor} ${badgeConfig.borderColor}
        `}>
          <span className="text-sm">{badgeConfig.icon}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${badgeConfig.color}`}>
            {badgeConfig.label}
          </span>
        </div>
        
        {/* Author name for context (optional, since tweet has it) */}
        <span className="text-xs text-nasun-white/30 font-medium">
          @{author.originalUsername || author.username}
        </span>
      </div>

      {/* Tweet Embed */}
      <div className="w-full nasun-tweet-container" data-theme="dark">
        <Tweet id={tweetId} />
      </div>

      {/* Custom Styles for react-tweet within Nasun context */}
      <style>{`
        .nasun-tweet-container .react-tweet-theme {
          --tweet-container-background: rgba(22, 24, 28, 0.6);
          --tweet-color-blue-primary: rgb(29, 155, 240);
          --tweet-color-hover: rgb(26, 26, 26);
          --tweet-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        
        /* Optional: Hide border or adjust rounded corners */
        .nasun-tweet-container article {
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}