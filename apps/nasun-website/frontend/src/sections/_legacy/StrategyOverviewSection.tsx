import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { Table } from "@/components/ui/table/Table";
import { TableHeader } from "@/components/ui/table/TableHeader";
import { TableBody } from "@/components/ui/table/TableBody";
import { TableRow } from "@/components/ui/table/TableRow";
import { TableCell } from "@/components/ui/table/TableCell";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Target,
  Lightbulb,
  Eye,
  Puzzle,
  Zap,
  MessageSquare,
  Heart,
} from "lucide-react";

interface NetworkFeature {
  title: string;
  description: string;
}

// ~ 문자만 Rubik Light로 렌더링하는 헬퍼 함수
const renderCellWithTilde = (text: string) => {
  if (!text.includes("~")) return text;

  return text.split(/(~)/g).map((part, index) =>
    part === "~" ? (
      <span key={index} className="font-rubik font-light">
        ~
      </span>
    ) : (
      part
    )
  );
};

export const StrategyOverviewSection = () => {
  const { t } = useTranslation("strategy");

  // Metrics
  const tableRows = t("metrics.table.rows", { returnObjects: true }) as string[][];
  const tableHeaders = t("metrics.table.headers", { returnObjects: true }) as string[];

  // CoreProblem
  const excelItems = t("coreProblem.excelAt.items", { returnObjects: true }) as string[];
  const struggleItems = t("coreProblem.struggleWith.items", { returnObjects: true }) as string[];

  // WhyNow
  const centralizesItems = t("whyNow.centralizes.items", { returnObjects: true }) as string[];
  const mustDeliverItems = t("whyNow.mustDeliver.items", { returnObjects: true }) as string[];

  // Thesis
  const enablesItems = t("thesis.enables.items", { returnObjects: true }) as string[];

  // WhyNetwork
  const features = t("whyNetwork.features", { returnObjects: true }) as NetworkFeature[];
  const networkIcons = [
    <Eye className="w-5 h-5 text-nasun-c3" key="eye" />,
    <Puzzle className="w-5 h-5 text-nasun-c3" key="puzzle" />,
    <Zap className="w-5 h-5 text-nasun-c3" key="zap" />,
    <MessageSquare className="w-5 h-5 text-nasun-c3" key="message" />,
  ];

  return (
    <SectionLayout className="">
      <div className="max-w-5xl mx-auto">
        {/* ========== 1. Metrics Section ========== */}
        <PageTitle>{t("hero.title")}</PageTitle>

        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("metrics.title")}
        </SectionTitle>

        <p className="text-nasun-white/80 font-medium mb-2 md:mb-2 lg:mb-3">{t("metrics.intro")}</p>

        <div className="mb-6 md:mb-8">
          <Table variant="c4">
            <TableHeader variant="c4">
              <TableRow>
                {tableHeaders.map((header, index) => (
                  <TableCell key={index} className="font-semibold text-nasun-white py-4 px-6">
                    {header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellIndex}
                      className={`py-3 px-6 ${
                        cellIndex === 0 ? "text-nasun-white/85" : "text-nasun-c4 font-semibold"
                      }`}
                    >
                      {renderCellWithTilde(cell)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <OuterBox color="n1" className="space-y-4 mb-16 md:mb-20">
          <p className="text-nasun-white/85 text-lg leading-relaxed">{t("metrics.conclusion1")}</p>
          <p className="text-nasun-white text-lg md:text-xl font-semibold">
            {t("metrics.conclusion2")}
          </p>
        </OuterBox>

        {/* ========== 2. CoreProblem Section ========== */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4 whitespace-pre-line">
          {t("coreProblem.title")}
        </SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 md:mb-8">
          <OuterBox color="c3" className="h-full">
            <h4 className="text-nasun-c3 font-semibold text-lg mb-4">
              {t("coreProblem.excelAt.title")}
            </h4>
            <ul className="space-y-3">
              {excelItems.map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-nasun-white/85">
                  <CheckCircle className="w-5 h-5 text-nasun-c3 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </OuterBox>

          <OuterBox color="c1" className="h-full">
            <h4 className="text-nasun-c1 font-semibold text-lg mb-4">
              {t("coreProblem.struggleWith.title")}
            </h4>
            <ul className="space-y-3">
              {struggleItems.map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-nasun-white/85">
                  <XCircle className="w-5 h-5 text-nasun-c1 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </OuterBox>
        </div>

        <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed mb-16 md:mb-20">
          {t("coreProblem.conclusion")}
        </p>

        {/* ========== 3. WhyNow Section ========== */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("whyNow.title")}
        </SectionTitle>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 md:mb-8">
          <OuterBox color="c1" className="h-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-nasun-c1" />
              <h4 className="text-nasun-c1 font-semibold text-lg">
                {t("whyNow.centralizes.intro")}
              </h4>
            </div>
            <ul className="space-y-3">
              {centralizesItems.map((item, index) => (
                <li key={index} className="flex items-center gap-3 text-nasun-white/85">
                  <span className="text-nasun-c1">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </OuterBox>

          <OuterBox color="c3" className="h-full">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-5 h-5 text-nasun-c3" />
              <h4 className="text-nasun-c3 font-semibold text-lg">
                {t("whyNow.mustDeliver.intro")}
              </h4>
            </div>
            <ul className="space-y-3">
              {mustDeliverItems.map((item, index) => (
                <li key={index} className="flex items-center gap-3 text-nasun-white/85">
                  <span className="text-nasun-c3">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </OuterBox>
        </div>

        <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed mb-16 md:mb-20">
          {t("whyNow.conclusion")}
        </p>

        {/* ========== 4. Thesis Section ========== */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4 whitespace-pre-line">
          {t("thesis.title")}
        </SectionTitle>

        <OuterBox color="white" className="py-5 md:py-6 mb-16 md:mb-20">
          <div className="flex items-center gap-3 mb-6">
            <Lightbulb className="w-6 h-6 text-nasun-white" />
            <span className="text-nasun-white font-semibold text-lg">Core Thesis</span>
          </div>

          <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed mb-6">
            {t("thesis.intro")}
          </p>

          <div className="mb-6">
            <p className="text-nasun-white/80 text-base md:text-lg mb-4">
              {t("thesis.enables.intro")}
            </p>
            <ul className="space-y-3">
              {enablesItems.map((item, index) => (
                <li key={index} className="flex items-center gap-3 text-nasun-white/80">
                  <span className="text-nasun-white/80">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed font-medium">
            {t("thesis.goal")}
          </p>
        </OuterBox>

        {/* ========== 5. WhyNetwork Section ========== */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("whyNetwork.title")}
        </SectionTitle>

        <p className="text-nasun-white/85 text-base md:text-lg leading-relaxed mb-6 md:mb-8">
          {t("whyNetwork.intro")}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          {features.map((feature, index) => (
            <DividerBox
              key={feature.title}
              title={feature.title}
              icon={networkIcons[index]}
              color="c3"
              titleClassName="text-nasun-c3"
              className="h-full"
            >
              <p className="text-nasun-white/85 text-sm md:text-base">{feature.description}</p>
            </DividerBox>
          ))}
        </div>

        <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed mb-16 md:mb-20">
          {t("whyNetwork.conclusion")}
        </p>

        {/* ========== 6. Soul Section ========== */}
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("soul.title")}
        </SectionTitle>

        <OuterBox color="c6" className="py-5 md:py-6">
          <div className="flex items-center gap-3 mb-6">
            <Heart className="w-6 h-6 text-nasun-c4" />
            <span className="text-nasun-c4 font-semibold text-lg">Our Vision</span>
          </div>

          <div className="space-y-6 text-nasun-white/90 text-base md:text-lg leading-relaxed">
            <p>{t("soul.p1")}</p>
            <p>{t("soul.p2")}</p>
          </div>
        </OuterBox>
      </div>
    </SectionLayout>
  );
};

export default StrategyOverviewSection;
