import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { OuterBox } from "../../../ui/OuterBox";
import { DividerBox } from "../../../ui/DividerBox";
import { StatusIcon } from "./StatusBadge";
import type { RoadmapItem } from "../../../../types/roadmap";

interface RoadmapItemCardProps {
  item: RoadmapItem;
  index: number;
}

const RoadmapItemCard = ({ item, index }: RoadmapItemCardProps) => {
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
        {item.description && <p className="text-nasun-white/50 text-sm mt-1">{item.description}</p>}
      </div>
    </motion.li>
  );
};

interface YearSectionProps {
  year: string;
  description: string;
  web3Items: RoadmapItem[];
  contentItems: RoadmapItem[];
  financeItems: RoadmapItem[];
  index: number;
}

const YearSection = ({ year, description, web3Items, contentItems, financeItems, index }: YearSectionProps) => {
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
      <OuterBox variant="default" className="bg-nasun-c6/40">
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
          <DividerBox color="c5" title={t("tracks.web3.title")} titleClassName="text-nasun-c5">
            <ul className="space-y-2">
              {safeWeb3Items.map((item, i) => (
                <RoadmapItemCard key={item.id} item={item} index={i} />
              ))}
            </ul>
          </DividerBox>

          {/* Content Track */}
          <DividerBox color="c3" title={t("tracks.content.title")} titleClassName="text-nasun-c3">
            <ul className="space-y-2">
              {safeContentItems.map((item, i) => (
                <RoadmapItemCard key={item.id} item={item} index={i} />
              ))}
            </ul>
          </DividerBox>

          {/* Finance Track */}
          <DividerBox color="c1" title={t("tracks.finance.title")} titleClassName="text-nasun-c1">
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

export const RoadmapTimelineSection = () => {
  const { t } = useTranslation("roadmap");

  // Get years data from translations
  const yearsData = t("years", { returnObjects: true }) as Record<
    string,
    {
      description: string;
      web3: RoadmapItem[];
      content: RoadmapItem[];
      finance: RoadmapItem[];
    }
  >;

  // Ensure yearsData is a valid object
  const safeYearsData = yearsData && typeof yearsData === "object" ? yearsData : {};

  const years = Object.entries(safeYearsData)
    .filter(([key]) => /^\d{4}$/.test(key)) // Only year keys like "2025", "2026"
    .sort(([a], [b]) => parseInt(a) - parseInt(b));

  return (
    <SectionLayout className="!max-w-7xl">
      <div className="space-y-8">
        {years.map(([year, data], index) => (
          <YearSection
            key={year}
            year={year}
            description={data.description}
            web3Items={data.web3}
            contentItems={data.content}
            financeItems={data.finance}
            index={index}
          />
        ))}
      </div>
    </SectionLayout>
  );
};

export default RoadmapTimelineSection;
