import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { OuterBox } from "@/components/ui/OuterBox";
import { DividerBox } from "@/components/ui/DividerBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
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
      <OuterBox color="default" className="bg-nasun-c6/40">
        {/* Year Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-4">
            <SectionTitle as="h3" color="white" className="!mb-0">
              {year}
            </SectionTitle>
            <span className="text-nasun-white/60">{description}</span>
          </div>
        </div>

        {/* Three Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Web3 Track */}
          <DividerBox
            color="c5"
            title={t("tracks.web3.title")}
            titleClassName="text-nasun-c5"
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
          >
            <ul className="space-y-2">
              {safeFinanceItems.map((item, i) => (
                <RoadmapItemCard key={item.id} item={item} index={i} />
              ))}
            </ul>
          </DividerBox>
        </div>
      </OuterBox>
    </motion.div>
  );
};
