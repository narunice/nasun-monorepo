import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { ScrollReveal } from "./animations";

// Extracted diagram components
import { ProblemCards } from "./diagrams/ProblemCards";
import { GuaranteesGrid } from "./diagrams/GuaranteesGrid";
import { ExecutionFlowDiagram } from "./diagrams/ExecutionFlowDiagram";
import { ExecutionFlowDetail } from "./diagrams/ExecutionFlowDetail";
import { TrustPillarsDiagram } from "./diagrams/TrustPillarsDiagram";
import { TrustDetail } from "./diagrams/TrustDetail";
import { ExecutorOverviewDiagram } from "./diagrams/ExecutorOverviewDiagram";
import { ExecutorDetail } from "./diagrams/ExecutorDetail";
import { MarketCards } from "./diagrams/MarketCards";
import { MarketDetail } from "./diagrams/MarketDetail";

// -- Shared section components --

function SectionDivider() {
  return (
    <div className="w-full max-w-2xl mx-auto px-8">
      <div className="h-px bg-gradient-to-r from-transparent via-nasun-c4/15 to-transparent" />
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="text-nasun-c4 font-medium text-sm uppercase tracking-wider mb-2">
      {text}
    </p>
  );
}

interface DiagramSectionProps {
  title: string;
  headline: string;
  overview: ReactNode;
  detail: ReactNode;
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
        <SectionLabel text={title} />
        <h3 className="font-bold">{headline}</h3>
      </div>

      {overview}

      <div className="mt-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-nasun-c4 hover:text-nasun-c5 transition-colors duration-200 text-sm font-medium group cursor-pointer"
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

// ============================================================
// Main Content
// ============================================================

export default function BaramContent() {
  const { t } = useTranslation("baram");

  return (
    <div className="flex flex-col gap-4 md:gap-6 lg:gap-8">
      {/* ========== HERO ========== */}
      <SectionLayout className="!pt-32 md:!pt-44 !pb-12 md:!pb-18 relative overflow-hidden">
        {/* Sky gradient backdrop */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(135,195,235,0.45) 0%, rgba(145,200,238,0.40) 40%, rgba(160,210,242,0.20) 70%, rgba(180,225,245,0.06) 90%, transparent 100%)",
          }}
        />
        {/* Drifting clouds */}
        <div
          className="baram-cloud-1 absolute pointer-events-none"
          style={{
            top: "20%", left: "5%", width: "420px", height: "130px", borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.5) 40%, transparent 70%)",
            filter: "blur(18px)",
          }}
        />
        <div
          className="baram-cloud-2 absolute pointer-events-none"
          style={{
            top: "65%", left: "30%", width: "520px", height: "150px", borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.4) 40%, transparent 70%)",
            filter: "blur(24px)",
          }}
        />
        <div
          className="baram-cloud-3 absolute pointer-events-none"
          style={{
            top: "40%", left: "50%", width: "350px", height: "110px", borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.45) 40%, transparent 70%)",
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

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="h-px w-32 mx-auto my-14 md:my-16 lg:my-20 bg-gradient-to-r from-transparent via-nasun-c4/30 to-transparent"
          />

          <motion.h3
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
            className="font-semibold text-nasun-black/70 mb-4"
          >
            {t("hero.tagline")}
          </motion.h3>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="!text-lg mb-2"
          >
            {t("hero.description")}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="text-nasun-black/60 !text-sm italic"
          >
            {t("hero.target")}
          </motion.p>
        </div>
      </SectionLayout>

      <SectionDivider />

      {/* ========== THE PROBLEM ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto">
          <div className="w-full">
            <div className="mb-6">
              <SectionLabel text={t("problem.sectionLabel")} />
              <h3 className="font-bold">
                {t("problem.headline")}
              </h3>
            </div>
            <ProblemCards />
          </div>
        </SectionLayout>
      </ScrollReveal>

      {/* ========== FOUR GUARANTEES ========== */}
      <div className="bg-gradient-to-r from-nasun-c7/[0.06] via-transparent to-nasun-c3/[0.06]">
        <ScrollReveal>
          <SectionLayout className="!max-w-7xl mx-auto">
            <div className="w-full">
              <div className="mb-6">
                <SectionLabel text={t("guarantees.sectionLabel")} />
                <h3 className="font-bold">
                  {t("guarantees.headline")}
                </h3>
              </div>
              <GuaranteesGrid />
            </div>
          </SectionLayout>
        </ScrollReveal>
      </div>

      <SectionDivider />

      {/* ========== HOW BARAM WORKS (merged: flow + AER + budget) ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto">
          <DiagramSection
            title={t("flow.sectionLabel")}
            headline={t("flow.headline")}
            overview={<ExecutionFlowDiagram />}
            detail={<ExecutionFlowDetail />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>

      <SectionDivider />

      {/* ========== TRUST & SECURITY (merged: trust + security invariants) ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto">
          <DiagramSection
            title={t("trust.sectionLabel")}
            headline={t("trust.headline")}
            overview={<TrustPillarsDiagram />}
            detail={<TrustDetail />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>

      <SectionDivider />

      {/* ========== EXECUTOR INFRASTRUCTURE ========== */}
      <div className="bg-gradient-to-br from-nasun-c3/[0.04] to-nasun-c2/[0.06]">
        <ScrollReveal>
          <SectionLayout className="!max-w-7xl mx-auto">
            <DiagramSection
              title={t("executor.sectionLabel")}
              headline={t("executor.headline")}
              overview={<ExecutorOverviewDiagram />}
              detail={<ExecutorDetail />}
              viewLabel={t("common.viewDetails")}
              hideLabel={t("common.hideDetails")}
            />
          </SectionLayout>
        </ScrollReveal>
      </div>

      <SectionDivider />

      {/* ========== MARKET & GTM (merged) ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto">
          <DiagramSection
            title={t("market.sectionLabel")}
            headline={t("market.headline")}
            overview={<MarketCards />}
            detail={<MarketDetail />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>

    </div>
  );
}
