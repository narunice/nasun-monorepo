import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { motion, AnimatePresence } from "framer-motion";
import { Flame } from "lucide-react";
import { useFeaturedFeed } from "../hooks/useFeaturedFeed";
import { useFeedRotation } from "../hooks/useFeedRotation";
import { FeedPostCard } from "./FeedPostCard";

interface NasunContentFeedProps {
  seasonId?: string;
}

export function NasunContentFeed({ seasonId }: NasunContentFeedProps) {
  const { t } = useTranslation("leaderboard");
  const { data, isLoading, isError } = useFeaturedFeed(seasonId);
  const rotatedItems = useFeedRotation(data?.items);

  return (
    <div className="flex flex-col">
      {/* Feed Header */}
      <div className="flex items-center gap-2 mt-2 mb-3 ">
        <div className="p-1.5 rounded-lg bg-nasun-c1/20 ">
          <Flame className="w-5 h-5 text-nasun-c1" />
        </div>
        <h5 className="uppercase font-medium">{t("v3.feed.title")}</h5>
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
            <p className="text-sm text-nasun-white/40">{t("v3.feed.loadError")}</p>
          </div>
        )}

        {!isLoading && !isError && rotatedItems.length === 0 && (
          <div className="py-12 text-center bg-nasun-c4/5 border border-white/5 rounded-sm px-4">
            <p className="text-sm text-nasun-white/40">{t("v3.feed.noData")}</p>
          </div>
        )}

        {!isLoading && !isError && rotatedItems.length > 0 && (
          <div className="flex flex-col gap-4" style={{ overflowAnchor: "none" }}>
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
          </div>
        )}
      </div>

    </div>
  );
}
