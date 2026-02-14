import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { Trophy, Calendar, Users } from "lucide-react";
import { MetricCard } from "./components/MetricCard";

export const RoadmapMetricsSection = () => {
  const { t } = useTranslation("roadmap");

  const metrics = [
    {
      value: "10+",
      label: t("metrics.awards"),
      color: "bg-nasun-c1/20",
      icon: <Trophy className="w-6 h-6 text-nasun-c1" />,
      delay: 0,
    },
    {
      value: "3",
      label: t("metrics.years"),
      color: "bg-nasun-c3/20",
      icon: <Calendar className="w-6 h-6 text-nasun-c3" />,
      delay: 0.1,
    },
    {
      value: "200+",
      label: t("metrics.community"),
      color: "bg-nasun-nw1/20",
      icon: <Users className="w-6 h-6 text-nasun-nw1" />,
      delay: 0.2,
    },
  ];

  return (
    <SectionLayout className="!max-w-6xl !py-0">
      <OuterBox color="n1" className="bg-nasun-c6/40">
        <div className="grid grid-cols-3 gap-4 md:gap-8">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </div>
      </OuterBox>
    </SectionLayout>
  );
};

export default RoadmapMetricsSection;
