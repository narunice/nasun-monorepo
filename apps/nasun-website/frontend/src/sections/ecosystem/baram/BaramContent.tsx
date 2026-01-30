import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ScrollReveal } from "./animations";
import { ProblemDiagram } from "./diagrams/ProblemDiagram";
import { ProblemDetailDiagram } from "./diagrams/ProblemDetailDiagram";
import { SolutionFlowDiagram } from "./diagrams/SolutionFlowDiagram";
import { SolutionFlowDetailDiagram } from "./diagrams/SolutionFlowDetailDiagram";
import { TrustModelDiagram } from "./diagrams/TrustModelDiagram";
import { TrustModelDetailDiagram } from "./diagrams/TrustModelDetailDiagram";
import { ExecutorDiagram } from "./diagrams/ExecutorDiagram";
import { ExecutorDetailDiagram } from "./diagrams/ExecutorDetailDiagram";

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
          className="flex items-center gap-2 text-nasun-c4 hover:text-nasun-c5 transition-colors duration-200 text-sm font-medium group"
        >
          {expanded ? hideLabel : viewLabel}
          {expanded ? (
            <ChevronUp className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          ) : (
            <ChevronDown className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
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

function SectionDivider() {
  return (
    <div className="w-full max-w-2xl mx-auto px-8">
      <div className="h-px bg-gradient-to-r from-transparent via-nasun-c4/15 to-transparent" />
    </div>
  );
}

export default function BaramContent() {
  const { t } = useTranslation("baram");

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {/* Hero */}
      <SectionLayout className="!py-16 md:!py-28 relative overflow-hidden">
        {/* Soft green-sky gradient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(160deg, rgba(148,225,211,0.10) 0%, rgba(179,224,255,0.12) 50%, rgba(148,225,211,0.06) 100%)",
          }}
        />

        <div className="text-center max-w-3xl mx-auto relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-5xl md:text-7xl font-bold mb-4 bg-gradient-to-r from-nasun-c4 via-[#3a9ec7] to-nasun-c3 bg-clip-text text-transparent"
          >
            {t("hero.title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="text-nasun-c4 text-lg md:text-xl font-medium mb-3"
          >
            {t("hero.subtitle")}
          </motion.p>

          {/* Breeze line divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="h-px w-32 mx-auto mb-6 bg-gradient-to-r from-transparent via-nasun-c4/30 to-transparent"
          />

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
            className="text-2xl md:text-3xl font-semibold text-nasun-black mb-4"
          >
            {t("hero.tagline")}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="text-nasun-black/70 text-lg mb-2"
          >
            {t("hero.description")}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="text-nasun-black/40 text-sm italic"
          >
            {t("hero.target")}
          </motion.p>
        </div>
      </SectionLayout>

      <SectionDivider />

      {/* Section 1: The Problem */}
      <ScrollReveal>
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
      </ScrollReveal>

      <SectionDivider />

      {/* Section 2: The Solution */}
      <div className="bg-gradient-to-r from-nasun-c7/[0.06] via-transparent to-nasun-c3/[0.06]">
        <ScrollReveal>
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
        </ScrollReveal>
      </div>

      <SectionDivider />

      {/* Section 3: The Trust Model */}
      <ScrollReveal>
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
      </ScrollReveal>

      <SectionDivider />

      {/* Section 4: Executor Infrastructure */}
      <div className="bg-gradient-to-br from-nasun-c3/[0.04] to-nasun-c2/[0.06]">
        <ScrollReveal>
          <SectionLayout>
            <DiagramSection
              title={t("executor.sectionTitle")}
              headline={t("executor.headline")}
              overview={<ExecutorDiagram />}
              detail={<ExecutorDetailDiagram />}
              viewLabel={t("common.viewDetails")}
              hideLabel={t("common.hideDetails")}
            />
          </SectionLayout>
        </ScrollReveal>
      </div>
    </div>
  );
}
