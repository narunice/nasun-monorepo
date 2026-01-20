import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { Doughnut } from "react-chartjs-2";
import {
  distributionData,
  type DistributionSubItem,
} from "../../../constants/pageContent/vision";
import { useTokenChart } from "./TokenDistribution/useTokenChart";

// Chart.js 등록
ChartJS.register(ArcElement, Tooltip, Legend, ChartDataLabels);

interface DistributionLabelProps {
  title: string;
  amount: number;
  percentage: number;
  color: string;
  subItems?: DistributionSubItem[];
}

const DistributionLabel: React.FC<DistributionLabelProps> = ({
  title,
  amount,
  percentage,
  color,
  subItems,
}) => {
  const formatAmount = (num: number) => {
    if (num >= 1e9) {
      return `${(num / 1e9).toFixed(0)}B`;
    }
    if (num >= 1e6) {
      return `${(num / 1e6).toFixed(0)}M`;
    }
    return num.toLocaleString();
  };

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-800 border border-nasun-white/10 hover:border-nasun-white/30 transition-all">
      {/* Color indicator */}
      <div
        className="w-3 h-12 rounded-full flex-shrink-0 mt-1"
        style={{ backgroundColor: color }}
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-nasun-white font-normal text-xs md:text-sm xl:text-base">{title}</p>
            <p className="text-nasun-white/80">{formatAmount(amount)} NSN</p>
          </div>
          {/* Percentage */}
          <div className="text-right flex-shrink-0">
            <h6 className="text-nasun-white">{percentage}%</h6>
          </div>
        </div>

        {/* SubItems breakdown */}
        {subItems && subItems.length > 0 && (
          <ul className="mt-3 space-y-1 text-nasun-white/80">
            {subItems.map((item, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-nasun-white/80" />
                <span>
                  {item.name} ({item.percentage}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

function TokenDistributionSection() {
  const { t } = useTranslation("tokenomics");
  const chartRef = useRef<ChartJS<"doughnut">>(null);
  const { chartData, chartOptions, colors } = useTokenChart();

  const translatedLabels = [
    t("distribution.community_treasury.title"),
    t("distribution.team_advisors.title"),
    t("distribution.public_sales.title"),
    t("distribution.early_contributors.title"),
    t("distribution.strategic_partners.title"),
    t("distribution.foundation.title"),
  ];

  return (
    <SectionLayout className="!max-w-6xl">
      <PageTitle as="h2" align="center">
        {t("distribution.heading")}
      </PageTitle>

      {/* Main Container */}

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center">
        {/* Chart */}
        <div className="w-full lg:w-1/2 max-w-md lg:max-w-none">
          <div className="relative h-[340px] md:h-[460px]">
            <Doughnut ref={chartRef} data={chartData} options={chartOptions} />

            {/* Center Text */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
              <p className="text-nasun-white/80 uppercase tracking-wider">
                {t("distribution.supply")}
              </p>
              <h6 className="text-nasun-white">10,000,000,000</h6>
              <p className="text-nasun-white/80">NSN</p>
            </div>
          </div>
        </div>

        {/* Labels */}
        <div className="w-full lg:w-1/2 space-y-3">
          {/* Subheading */}
          <h6 className="text-nasun-white/80 font-medium  uppercase tracking-wider pl-4">
            {t("distribution.subheading")}
          </h6>
          {distributionData.map((item, index) => {
            return (
              <DistributionLabel
                key={item.name}
                title={translatedLabels[index]}
                amount={item.amount}
                percentage={item.value}
                color={colors[index]?.border || "#ffffff"}
              />
            );
          })}
        </div>
      </div>
      {/* Bottom Description */}
      <p className="text-center text-nasun-white/80 max-w-3xl mx-auto mt-16 whitespace-pre-line ">
        {t("distribution.description_bottom")}
      </p>
    </SectionLayout>
  );
}

export default React.memo(TokenDistributionSection);
