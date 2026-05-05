import React, { useRef } from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "../../../../layout/SectionLayout";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Doughnut } from "react-chartjs-2";
import { distributionData } from "../../../../../constants/pageContent/vision";
import { LabelBlock, CommunityLabelBlock } from "./LabelBlocks";
import { useTokenChart } from "./useTokenChart";

// Chart.js 등록
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

// 커스텀 툴팁 포지셔너 등록 (마우스 커서를 따라다님)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Tooltip.positioners as any).mouse = function (_elements: any, eventPosition: any) {
  return {
    x: eventPosition.x,
    y: eventPosition.y,
  };
};

function TokenDistributionSection() {
  const { t } = useTranslation("tokenomics");
  const chartRef = useRef<ChartJS<"doughnut">>(null);
  const { chartData, chartOptions, colors } = useTokenChart();

  return (
    <SectionLayout className="!max-w-7xl mx-auto ">
      <h1 className="font-semibold text-center lg:text-left text-nasun-white">
        NSN Token Distribution
      </h1>

      <div className="w-full py-4 md:my-8 lg:py-16">
        {/* Desktop: 차트(왼쪽) + 레이블(오른쪽) */}
        <div className="flex flex-col lg:flex-row gap-6 md:gap-12 lg:gap-16 items-center lg:items-start">
          {/* 도넛 차트 */}
          <div className="w-full lg:w-1/2 xl:w-3/5 max-w-md lg:max-w-none relative">
            <div className="w-full h-[400px] lg:h-[500px] relative">
              <Doughnut ref={chartRef} data={chartData} options={chartOptions} />

              {/* 중앙 텍스트 오버레이 */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <h6 className="text-nasun-white/70">{t("distribution.supply").toUpperCase()}</h6>
                <p className="font-semibold">100,000,000,000</p>
                <p className="text-nasun-white/70">NSN</p>
              </div>
            </div>
          </div>

          {/* 레이블 리스트 (오른쪽) */}
          <div className="w-full lg:w-1/2 space-y-6 px-6 lg:px-0">
            <CommunityLabelBlock
              title={t("distribution.community_reserve.title")}
              amount={distributionData[0].amount}
              percentage={distributionData[0].value}
              color={colors[0].border}
              subItems={distributionData[0].subItems || []}
            />
            <LabelBlock
              title={t("distribution.public_sales.title")}
              amount={distributionData[1].amount}
              percentage={distributionData[1].value}
              color={colors[1].border}
            />
            <LabelBlock
              title={t("distribution.early_contributors")}
              amount={distributionData[2].amount}
              percentage={distributionData[2].value}
              color={colors[2].border}
            />
            <LabelBlock
              title={t("distribution.nasun_core")}
              amount={distributionData[3].amount}
              percentage={distributionData[3].value}
              color={colors[3].border}
            />
            <LabelBlock
              title={t("distribution.testers")}
              amount={distributionData[4].amount}
              percentage={distributionData[4].value}
              color={colors[4].border}
            />
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(TokenDistributionSection);
