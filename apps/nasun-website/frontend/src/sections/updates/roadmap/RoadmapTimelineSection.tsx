import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { YearSection } from "./components/YearSection";
import type { RoadmapItem } from "../../../types/roadmap";

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
