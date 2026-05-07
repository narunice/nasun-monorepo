import { useMemo } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { Trophy, Calendar, Users } from "lucide-react";
import grantsData from "../../../assets/locales/en/grants.json";
import { MetricCard } from "./components/MetricCard";

// Manually maintained community size. Update this constant periodically.
const COMMUNITY_COUNT = 5177;

export const RoadmapIntroSection = () => {
  const { t } = useTranslation("roadmap");

  // grants.json에서 실제 awards 수를 가져옴
  const grantsCount = useMemo(() => {
    try {
      return grantsData.grants?.list?.length || 10;
    } catch {
      return 10; // 폴백 값
    }
  }, []);

  // 2024년 시작점 기준 현재까지의 년수 계산
  const yearsBuilding = useMemo(() => {
    const startYear = 2024;
    const currentYear = new Date().getFullYear();
    return currentYear - startYear + 1;
  }, []);

  const communityCount = COMMUNITY_COUNT;

  const metrics = [
    {
      value: `${grantsCount}+`,
      label: t("metrics.awards"),
      color: "bg-nasun-nw1/20",
      icon: <Trophy className="w-6 h-6 text-nasun-nw1" />,
      delay: 0,
    },
    {
      value: `${yearsBuilding}`,
      label: t("metrics.years"),
      color: "bg-nasun-c1/20",
      icon: <Calendar className="w-6 h-6 text-nasun-c1" />,
      delay: 0.1,
    },
    {
      value: `${communityCount}+`,
      label: t("metrics.community"),
      color: "bg-nasun-c3/20",
      icon: <Users className="w-6 h-6 text-nasun-c3" />,
      delay: 0.2,
    },
  ];

  return (
    <SectionLayout className="!max-w-7xl gap-8 md:gap-10 xl:gap-12">
      <PageTitle as="h2" align="center">
        {t("title")}
      </PageTitle>

      <OuterBox color="nw3" className="!bg-gray-900">
        {/* Heading */}
        <div className="text-left mb-6 md:mb-8">
          <h4 className="font-medium text-nasun-white -mb-1">{t("intro.heading")}</h4>
          <h5 className="font-medium text-nasun-c1">{t("intro.subheading")}</h5>
        </div>

        {/* Description */}
        <p className="text-nasun-white/80 leading-relaxed">{t("intro.description")}</p>

        {/* Metrics */}
        <div className="mt-6 pt-4 md:pt-6 lg:pt-8 xl:pt-10 border-t border-nasun-white/10">
          <div className="grid grid-cols-3 gap-1 -mx-2 md:mx-0 md:gap-8">
            {metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </div>
      </OuterBox>
    </SectionLayout>
  );
};

export default RoadmapIntroSection;
