import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { ScrollReveal } from "./animations";

// Dark diagram components
import { ProblemCardsDark } from "./diagrams/ProblemCardsDark";
import { GuaranteesGridDark } from "./diagrams/GuaranteesGridDark";
import { ExecutionFlowDiagramDark } from "./diagrams/ExecutionFlowDiagramDark";
import { ExecutionFlowDetailDark } from "./diagrams/ExecutionFlowDetailDark";
import { TrustPillarsDiagramDark } from "./diagrams/TrustPillarsDiagramDark";
import { TrustDetailDark } from "./diagrams/TrustDetailDark";
import { ExecutorOverviewDiagramDark } from "./diagrams/ExecutorOverviewDiagramDark";
import { ExecutorDetailDark } from "./diagrams/ExecutorDetailDark";
import { MarketCardsDark } from "./diagrams/MarketCardsDark";
import { MarketDetailDark } from "./diagrams/MarketDetailDark";

// -- Shared section components (dark themed) --

function SectionDivider() {
  return (
    <div className="w-full max-w-2xl mx-auto px-8 -my-1 md:-my-1.5 lg:-my-2">
      <div className="h-px bg-gradient-to-r from-transparent via-nasun-br-1/20 to-transparent" />
    </div>
  );
}

function SectionLabel({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={`text-nasun-br-1 font-medium text-sm uppercase tracking-wider mb-2 ${className || ""}`}
    >
      {text}
    </p>
  );
}

interface DiagramSectionProps {
  title: string;
  headline: string;
  overview: ReactNode;
  afterOverview?: ReactNode;
  detail: ReactNode;
  viewLabel: string;
  hideLabel: string;
}

function DiagramSection({
  title,
  headline,
  overview,
  afterOverview,
  detail,
  viewLabel,
  hideLabel,
}: DiagramSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="w-full">
      <div className="mb-6">
        <SectionLabel text={title} className="text-br-2" />
        <h3 className="font-bold text-nasun-white">{headline}</h3>
      </div>

      {overview}

      {afterOverview}

      <div className="mt-6">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 transition-colors duration-200 text-sm font-medium group cursor-pointer"
          style={{ color: "rgba(250,247,244,0.6)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(250,247,244,0.8)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(250,247,244,0.6)")}
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
// Main Content (Dark Theme)
// ============================================================

export default function BaramDarkContent() {
  const { t } = useTranslation("baram");
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-2 md:gap-3 lg:gap-4">
      {/* ========== HERO ========== */}
      <SectionLayout className="!pt-32 md:!pt-44 !pb-8 md:!pb-12 relative overflow-hidden">
        <div className="text-center max-w-3xl mx-auto relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-5xl md:text-7xl font-bold mb-4 bg-clip-text text-transparent uppercase"
            style={{ backgroundImage: "linear-gradient(135deg, #88c087, #80bb9e, #80acc8)" }}
          >
            {t("hero.title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }}
            className="text-nasun-br-1 text-lg md:text-xl font-medium mb-8"
          >
            {t("hero.subtitle")}
          </motion.p>

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="h-px w-32 mx-auto my-8 md:my-10 lg:my-12"
            style={{
              backgroundImage:
                "linear-gradient(to right, transparent, rgba(167,215,191,0.6), transparent)",
            }}
          />

          <motion.h3
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
            className="font-semibold text-nasun-white mb-4"
          >
            {t("hero.tagline")}
          </motion.h3>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.45 }}
            className="text-lg text-nasun-white/90 mb-2"
          >
            {t("hero.description")}
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="text-nasun-white/70 text-sm italic"
          >
            {t("hero.target")}
          </motion.p>
        </div>
      </SectionLayout>

      <SectionDivider />

      {/* ========== THE PROBLEM ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto !py-2 md:!py-4 lg:!py-5 xl:!py-6">
          <div className="w-full">
            <div className="mb-6">
              <SectionLabel text={t("problem.sectionLabel")} className="text-br-3" />
              <h3 className="font-bold text-nasun-white">{t("problem.headline")}</h3>
            </div>
            <ProblemCardsDark />
          </div>
        </SectionLayout>
      </ScrollReveal>

      {/* ========== FOUR GUARANTEES ========== */}
      <div className="bg-gradient-to-r from-nasun-br-1d/[0.06] via-transparent to-nasun-br-3d/[0.06]">
        <ScrollReveal>
          <SectionLayout className="!max-w-7xl mx-auto !py-2 md:!py-4 lg:!py-5 xl:!py-6">
            <div className="w-full">
              <div className="mb-6">
                <SectionLabel text={t("guarantees.sectionLabel")} className="text-br-1" />
                <h3 className="font-bold text-nasun-white">{t("guarantees.headline")}</h3>
              </div>
              <GuaranteesGridDark />
            </div>
          </SectionLayout>
        </ScrollReveal>
      </div>

      <SectionDivider />

      {/* ========== HOW BARAM WORKS ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto !py-2 md:!py-4 lg:!py-5 xl:!py-6">
          <DiagramSection
            title={t("flow.sectionLabel")}
            headline={t("flow.headline")}
            overview={<ExecutionFlowDiagramDark />}
            afterOverview={
              <video
                src={
                  isMobile
                    ? "/videos/Baram-Agency-mobile-rf28.mp4"
                    : "/videos/Baram-Agency-rf28.mp4"
                }
                autoPlay
                loop
                muted
                playsInline
                controls
                className="mt-8 w-full rounded-lg"
              />
            }
            detail={<ExecutionFlowDetailDark />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>

      <SectionDivider />

      {/* ========== TRUST & SECURITY ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto !py-2 md:!py-4 lg:!py-5 xl:!py-6">
          <DiagramSection
            title={t("trust.sectionLabel")}
            headline={t("trust.headline")}
            overview={<TrustPillarsDiagramDark />}
            detail={<TrustDetailDark />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>

      <SectionDivider />

      {/* ========== EXECUTOR INFRASTRUCTURE ========== */}
      <div className="bg-gradient-to-br from-nasun-br-1d/[0.04] to-nasun-br-3d/[0.06]">
        <ScrollReveal>
          <SectionLayout className="!max-w-7xl mx-auto">
            <DiagramSection
              title={t("executor.sectionLabel")}
              headline={t("executor.headline")}
              overview={<ExecutorOverviewDiagramDark />}
              detail={<ExecutorDetailDark />}
              viewLabel={t("common.viewDetails")}
              hideLabel={t("common.hideDetails")}
            />
          </SectionLayout>
        </ScrollReveal>
      </div>

      <SectionDivider />

      {/* ========== MARKET & GTM ========== */}
      <ScrollReveal>
        <SectionLayout className="!max-w-7xl mx-auto !py-2 md:!py-4 lg:!py-5 xl:!py-6">
          <DiagramSection
            title={t("market.sectionLabel")}
            headline={t("market.headline")}
            overview={<MarketCardsDark />}
            detail={<MarketDetailDark />}
            viewLabel={t("common.viewDetails")}
            hideLabel={t("common.hideDetails")}
          />
        </SectionLayout>
      </ScrollReveal>
    </div>
  );
}
