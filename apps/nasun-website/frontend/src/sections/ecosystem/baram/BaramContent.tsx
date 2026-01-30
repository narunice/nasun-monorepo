import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ScrollReveal } from "./animations";
import { ProblemDiagram } from "./diagrams/ProblemDiagram";
import { ProblemDetailDiagram } from "./diagrams/ProblemDetailDiagram";
import { SolutionFlowDiagram } from "./diagrams/SolutionFlowDiagram";
import { ArchitectureLayerCards } from "./diagrams/ArchitectureLayerCards";
import { ArchitectureMermaid } from "./diagrams/ArchitectureMermaid";
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
        <p className="text-nasun-c4 font-medium text-sm uppercase tracking-wider mb-2">{title}</p>
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
    <div className="flex flex-col gap-4 md:gap-6 lg:gap-8 ">
      {/* Hero */}
      <SectionLayout className="!pt-32 md:!pt-44 !pb-12 md:!pb-18 relative overflow-hidden">
        {/* Sky-blue gradient backdrop — fades to transparent at bottom */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(135,195,235,0.45) 0%, rgba(145,200,238,0.40) 40%, rgba(160,210,242,0.20) 70%, rgba(180,225,245,0.06) 90%, transparent 100%)",
          }}
        />

        {/* Drifting white cloud layers */}
        <div
          className="baram-cloud-1 absolute pointer-events-none"
          style={{
            top: "20%",
            left: "5%",
            width: "420px",
            height: "130px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.5) 40%, transparent 70%)",
            filter: "blur(18px)",
          }}
        />
        <div
          className="baram-cloud-2 absolute pointer-events-none"
          style={{
            top: "65%",
            left: "30%",
            width: "520px",
            height: "150px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.4) 40%, transparent 70%)",
            filter: "blur(24px)",
          }}
        />
        <div
          className="baram-cloud-3 absolute pointer-events-none"
          style={{
            top: "40%",
            left: "50%",
            width: "350px",
            height: "110px",
            borderRadius: "50%",
            background:
              "radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.45) 40%, transparent 70%)",
            filter: "blur(16px)",
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
            className="text-nasun-c4 text-lg md:text-xl font-medium mb-8"
          >
            {t("hero.subtitle")}
          </motion.p>

          {/* Breeze line divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="h-px w-32 mx-auto my-14 md:my-16 lg:my-20 bg-gradient-to-r from-transparent via-nasun-c4/30 to-transparent"
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
        <SectionLayout className="!max-w-7xl mx-auto">
          <div className="w-full">
            <div className="mb-6">
              <p className="text-nasun-c4 font-medium text-sm uppercase tracking-wider mb-2">
                {t("problem.sectionTitle")}
              </p>
              <h3 className="text-2xl md:text-3xl font-bold text-nasun-black">
                {t("problem.headline")}
              </h3>
            </div>
            <ProblemDiagram />
          </div>
        </SectionLayout>
      </ScrollReveal>

      {/* Section 2: The Solution */}
      <div className="bg-gradient-to-r from-nasun-c7/[0.06] via-transparent to-nasun-c3/[0.06]">
        <ScrollReveal>
          <SectionLayout className="!max-w-7xl mx-auto">
            <div className="w-full">
              <div className="mb-6">
                <p className="text-nasun-c4 font-medium text-sm uppercase tracking-wider mb-2">
                  {t("solution.sectionTitle")}
                </p>
                <h3 className="text-2xl md:text-3xl font-bold text-nasun-black">
                  {t("solution.headline")}
                </h3>
              </div>
              <SolutionFlowDiagram>
                <ProblemDetailDiagram />
              </SolutionFlowDiagram>
            </div>
          </SectionLayout>
        </ScrollReveal>
      </div>

      <SectionDivider />

      {/* Section: Architecture */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto">
          <DiagramSection
            title={t("architecture.sectionTitle")}
            headline={t("architecture.headline")}
            overview={<ArchitectureLayerCards />}
            detail={<ArchitectureMermaid />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>

      <SectionDivider />

      {/* Section 3: The Trust Model */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto">
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
          <SectionLayout className="!max-w-7xl mx-auto">
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
