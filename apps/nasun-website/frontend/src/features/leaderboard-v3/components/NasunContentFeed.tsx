/**
 * NasunContentFeed Component
 *
 * Container for the featured posts stack.
 * Auto-rotates every 20 seconds with slide-up animation.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame } from "lucide-react";
import { useFeaturedFeed } from "../hooks/useFeaturedFeed";
import { FeedPostCard } from "./FeedPostCard";
import type { FeaturedFeedItem } from "../types";

interface NasunContentFeedProps {
  seasonId?: string;
}

const ROTATION_INTERVAL = 20000; // 20 seconds

export function NasunContentFeed({ seasonId }: NasunContentFeedProps) {
  const { data, isLoading, isError } = useFeaturedFeed(seasonId);
  const [rotatedItems, setRotatedItems] = useState<FeaturedFeedItem[]>([]);

  // Initialize/sync rotatedItems when data changes
  useEffect(() => {
    if (data?.items) {
      setRotatedItems(data.items);
    }
  }, [data?.items]);

  // Auto-rotation timer
  useEffect(() => {
    if (rotatedItems.length <= 1) return;

    const interval = setInterval(() => {
      setRotatedItems((prev) => {
        const [first, ...rest] = prev;
        return [...rest, first];
      });
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [rotatedItems.length]);

  return (
    <div className="flex flex-col">
      {/* Feed Header */}
      <div className="flex items-center gap-2 mt-2 mb-3 ">
        <div className="p-1.5 rounded-lg bg-nasun-c1/20 ">
          <Flame className="w-5 h-5 text-nasun-c1" />
        </div>
        <h5 className="uppercase font-medium">Featured Posts</h5>
      </div>

      {/* Feed Content */}
      <div className="flex flex-col gap-4">
        {isLoading && (
          <div className="">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 rounded-sm bg-nasun-c4/5 border border-white/5 animate-pulse"
              />
            ))}
          </div>
        )}

        {isError && (
          <div className="py-12 text-center bg-nasun-c4/5 border border-white/5 rounded-sm px-4">
            <p className="text-sm text-nasun-white/40">Failed to load feed</p>
          </div>
        )}

        {!isLoading && !isError && rotatedItems.length === 0 && (
          <div className="py-12 text-center bg-nasun-c4/5 border border-white/5 rounded-sm px-4">
            <p className="text-sm text-nasun-white/40">No featured posts yet</p>
          </div>
        )}

        {!isLoading && !isError && rotatedItems.length > 0 && (
          <AnimatePresence mode="popLayout">
            {rotatedItems.map((item) => (
              <motion.div
                key={item.postId}
                layout
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                <FeedPostCard item={item} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Footer Info */}
      <div className="mt-2 px-1 text-[10px] text-nasun-white/40 uppercase tracking-widest text-center">
        Recent posts from top rankers and climbers
      </div>
    </div>
  );
}
