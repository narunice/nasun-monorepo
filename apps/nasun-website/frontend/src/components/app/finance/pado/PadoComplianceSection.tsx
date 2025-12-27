import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PageTitle, DividerBox } from "@/components/ui";
import { OuterBox } from "@/components/ui/OuterBox";
import { Target } from "lucide-react";

function PadoComplianceSection() {
  const { t } = useTranslation("pado");

  return (
    <SectionLayout className="">
      <div className="max-w-5xl mx-auto">
        {/* Main Title */}
        <PageTitle as="h2" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("compliance.title")}
        </PageTitle>

        {/* Intro */}
        <div className="space-y-4 md:space-y-5 lg:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p className="text-nasun-white/80">
            {t("compliance.intro")}
          </p>
          <p className="text-nasun-white/90 font-medium">
            {t("compliance.philosophy")}
          </p>
        </div>

        {/* 1. Operating in a Maturing Global Regulatory Landscape */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("compliance.regulatoryLandscape.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="text-nasun-white/80">
              {t("compliance.regulatoryLandscape.content")}
            </p>

            {/* Sub-sections in cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <DividerBox
                color="c4"
                titleClassName="text-nasun-c4"
                title={t("compliance.regulatoryLandscape.privacy.title")}
                description={t("compliance.regulatoryLandscape.privacy.content")}
              />
              <DividerBox
                color="c4"
                titleClassName="text-nasun-c4"
                title={t("compliance.regulatoryLandscape.riskAligned.title")}
                description={t("compliance.regulatoryLandscape.riskAligned.content")}
              />
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("compliance.regulatoryLandscape.conclusion")}
            </p>
          </div>
        </div>

        {/* 2. Jurisdictional Strategy and Foundation Alignment */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("compliance.jurisdictional.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="text-nasun-white/80">
              {t("compliance.jurisdictional.content")}
            </p>

            {/* Jurisdictions in cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <DividerBox
                color="c3"
                titleClassName="text-nasun-c3"
                title={t("compliance.jurisdictional.singapore.title")}
                description={t("compliance.jurisdictional.singapore.content")}
              />
              <DividerBox
                color="c3"
                titleClassName="text-nasun-c3"
                title={t("compliance.jurisdictional.unitedStates.title")}
                description={t("compliance.jurisdictional.unitedStates.content")}
              />
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("compliance.jurisdictional.conclusion")}
            </p>
          </div>
        </div>

        {/* 3. Protocol-Level Standards and Self-Governance */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("compliance.protocolLevel.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="text-nasun-white/80">
              {t("compliance.protocolLevel.content")}
            </p>

            {/* Standards in cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <DividerBox
                color="c5"
                titleClassName="text-nasun-c5"
                title={t("compliance.protocolLevel.verifiability.title")}
                description={t("compliance.protocolLevel.verifiability.content")}
              />
              <DividerBox
                color="c5"
                titleClassName="text-nasun-c5"
                title={t("compliance.protocolLevel.riskEnforcement.title")}
                description={t("compliance.protocolLevel.riskEnforcement.content")}
              />
              <DividerBox
                color="c5"
                titleClassName="text-nasun-c5"
                title={t("compliance.protocolLevel.decentralization.title")}
                description={t("compliance.protocolLevel.decentralization.content")}
              />
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("compliance.protocolLevel.conclusion")}
            </p>
          </div>
        </div>

        {/* Our Objective */}
        <OuterBox variant="white" className="">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-6 h-6 text-nasun-white" />
            <h3 className="text-nasun-white font-semibold text-lg">
              {t("compliance.objective.title")}
            </h3>
          </div>
          <div className="space-y-4">
            <p className="text-nasun-white/90 font-medium">
              {t("compliance.objective.content")}
            </p>
            <p className="text-nasun-white/80 italic">
              {t("compliance.objective.closing")}
            </p>
          </div>
        </OuterBox>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PadoComplianceSection);
