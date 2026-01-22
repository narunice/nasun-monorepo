/**
 * NasunContentFeed Component
 *
 * Container for the featured posts stack.
 * Displays content from top rankers and climbers.
 */

import { Flame } from 'lucide-react';
import { useFeaturedFeed } from '../hooks/useFeaturedFeed';
import { FeedPostCard } from './FeedPostCard';

interface NasunContentFeedProps {
  seasonId?: string;
}

export function NasunContentFeed({ seasonId }: NasunContentFeedProps) {
  const { data, isLoading, isError } = useFeaturedFeed(seasonId);

  return (
    <div className="flex flex-col gap-4">
      {/* Feed Header */}
      <div className="flex items-center gap-2 px-1">
        <div className="p-1.5 rounded-lg bg-nasun-c3/20">
          <Flame className="w-5 h-5 text-nasun-c3" />
        </div>
        <h3 className="font-bold text-lg text-nasun-white uppercase tracking-tight">
          Featured Posts
        </h3>
      </div>

      {/* Feed Content */}
      <div className="flex flex-col gap-4">
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-xl bg-nasun-c4/5 border border-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <div className="py-12 text-center bg-nasun-c4/5 border border-white/5 rounded-xl px-4">
            <p className="text-sm text-nasun-white/40">Failed to load feed</p>
          </div>
        )}

        {!isLoading && !isError && data?.items.length === 0 && (
          <div className="py-12 text-center bg-nasun-c4/5 border border-white/5 rounded-xl px-4">
            <p className="text-sm text-nasun-white/40">No featured posts yet</p>
          </div>
        )}

        {!isLoading && !isError && data?.items.map((item) => (
          <FeedPostCard key={item.postId} item={item} />
        ))}
      </div>

      {/* Footer Info */}
      <div className="mt-2 px-1 text-[10px] text-nasun-white/20 uppercase tracking-widest text-center">
        Updated live from community curator
      </div>
    </div>
  );
}
