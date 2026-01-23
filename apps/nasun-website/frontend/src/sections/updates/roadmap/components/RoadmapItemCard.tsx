import { motion } from "framer-motion";
import { StatusIcon } from "./StatusBadge";
import type { RoadmapItem } from "@/types/roadmap";

interface RoadmapItemCardProps {
  item: RoadmapItem;
  index: number;
}

export const RoadmapItemCard = ({ item, index }: RoadmapItemCardProps) => {
  // Only show status for completed and in-progress items
  const showStatus = item.status === "completed" || item.status === "in-progress";

  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      viewport={{ once: true }}
      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
        item.status === "completed"
          ? "bg-green-500/5"
          : item.status === "in-progress"
            ? "bg-nasun-c1/5"
            : "bg-nasun-white/5"
      }`}
    >
      {showStatus && (
        <div className="flex-shrink-0 mt-0.5">
          <StatusIcon status={item.status} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span
          className={`font-medium ${
            item.status === "upcoming" ? "text-nasun-white/70" : "text-nasun-white"
          }`}
        >
          {item.title}
        </span>
        {item.description && (
          <p className="text-nasun-white/50 text-sm mt-1">{item.description}</p>
        )}
      </div>
    </motion.li>
  );
};
