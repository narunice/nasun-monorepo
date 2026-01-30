import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ProblemDiagram } from "./diagrams/ProblemDiagram";
import { ProblemDetailDiagram } from "./diagrams/ProblemDetailDiagram";
import { SolutionFlowDiagram } from "./diagrams/SolutionFlowDiagram";
import { SolutionFlowDetailDiagram } from "./diagrams/SolutionFlowDetailDiagram";
import { TrustModelDiagram } from "./diagrams/TrustModelDiagram";
import { TrustModelDetailDiagram } from "./diagrams/TrustModelDetailDiagram";

interface DiagramSectionProps {
  title: string;
  headline: string;
  overview: React.ReactNode;
  detail: React.ReactNode;
  viewLabel: string;
  hideLabel: string;
}

function DiagramSection({
  title,
  headline,
  overview,
  detail,
  viewLabel,
  hideLabel,
}: DiagramSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full">
      <div className="mb-6">
        <p className="text-nasun-c4 font-medium text-sm uppercase tracking-wider mb-2">
          {title}
        </p>
        <h3 className="text-2xl md:text-3xl font-bold text-nasun-black">{headline}</h3>
      </div>

      {overview}

      <div className="mt-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-nasun-c4 hover:text-nasun-c4/70 transition-colors text-sm font-medium"
        >
          {expanded ? hideLabel : viewLabel}
          {expanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      <div
        className={`transition-all duration-500 ease-in-out ${
          expanded
            ? "max-h-[10000px] opacity-100 mt-6 overflow-visible"
            : "max-h-0 opacity-0 overflow-hidden"
        }`}
      >
        {detail}
      </div>
    </div>
  );
}

export default function BaramContent() {
  const { t } = useTranslation("baram");

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {/* Hero */}
      <SectionLayout className="!py-12 md:!py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold text-nasun-black mb-4">
            {t("hero.title")}
          </h1>
          <p className="text-nasun-c4 text-lg md:text-xl font-medium mb-6">
            {t("hero.subtitle")}
          </p>
          <p className="text-2xl md:text-3xl font-semibold text-nasun-black mb-4">
            {t("hero.tagline")}
          </p>
          <p className="text-nasun-black/70 text-lg mb-2">
            {t("hero.description")}
          </p>
          <p className="text-nasun-black/40 text-sm italic">
            {t("hero.target")}
          </p>
        </div>
      </SectionLayout>

      {/* Section 1: The Problem */}
      <SectionLayout>
        <DiagramSection
          title={t("problem.sectionTitle")}
          headline={t("problem.headline")}
          overview={<ProblemDiagram />}
          detail={<ProblemDetailDiagram />}
          viewLabel={t("common.viewDetails")}
          hideLabel={t("common.hideDetails")}
        />
      </SectionLayout>

      {/* Section 2: The Solution */}
      <SectionLayout>
        <DiagramSection
          title={t("solution.sectionTitle")}
          headline={t("solution.headline")}
          overview={<SolutionFlowDiagram />}
          detail={<SolutionFlowDetailDiagram />}
          viewLabel={t("common.viewDetails")}
          hideLabel={t("common.hideDetails")}
        />
      </SectionLayout>

      {/* Section 3: The Trust Model */}
      <SectionLayout>
        <DiagramSection
          title={t("trust.sectionTitle")}
          headline={t("trust.headline")}
          overview={<TrustModelDiagram />}
          detail={<TrustModelDetailDiagram />}
          viewLabel={t("common.viewDetails")}
          hideLabel={t("common.hideDetails")}
        />
      </SectionLayout>
    </div>
  );
}
