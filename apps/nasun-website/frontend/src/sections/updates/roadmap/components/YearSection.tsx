import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { motion } from "framer-motion";
import { DividerBox } from "@/components/ui/DividerBox";
import { RoadmapItemCard } from "./RoadmapItemCard";
import type { RoadmapItem } from "@/types/roadmap";

interface YearSectionProps {
  year: string;
  description: string;
  web3Items: RoadmapItem[];
  contentItems: RoadmapItem[];
  financeItems: RoadmapItem[];
  index: number;
}

export const YearSection = ({
  year,
  description,
  web3Items,
  contentItems,
  financeItems,
  index,
}: YearSectionProps) => {
  const { t } = useTranslation("roadmap");

  // Ensure items are arrays (fallback to empty array)
  const safeWeb3Items = Array.isArray(web3Items) ? web3Items : [];
  const safeContentItems = Array.isArray(contentItems) ? contentItems : [];
  const safeFinanceItems = Array.isArray(financeItems) ? financeItems : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      viewport={{ once: true }}
    >
      {/* Year Header */}
      <div className="flex items-center gap-4 mb-4">
        <h4 className="font-medium">{year}</h4>
        <span className="text-nasun-white/60">{description}</span>
      </div>

      {/* Three Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Web3 Track */}
        <DividerBox
          color="c4"
          title={t("tracks.web3.title")}
          titleClassName="text-nasun-c4"
          className="!bg-gray-950/50"
        >
          <ul className="space-y-2">
            {safeWeb3Items.map((item, i) => (
              <RoadmapItemCard key={item.id} item={item} index={i} />
            ))}
          </ul>
        </DividerBox>

        {/* Content Track */}
        <DividerBox
          color="c1"
          title={t("tracks.content.title")}
          titleClassName="text-nasun-c1"
          className="!bg-gray-950/50"
        >
          <ul className="space-y-2">
            {safeContentItems.map((item, i) => (
              <RoadmapItemCard key={item.id} item={item} index={i} />
            ))}
          </ul>
        </DividerBox>

        {/* Finance Track */}
        <DividerBox
          color="c3"
          title={t("tracks.finance.title")}
          titleClassName="text-nasun-c3"
          className="!bg-gray-950/50"
        >
          <ul className="space-y-2">
            {safeFinanceItems.map((item, i) => (
              <RoadmapItemCard key={item.id} item={item} index={i} />
            ))}
          </ul>
        </DividerBox>
      </div>
    </motion.div>
  );
};
