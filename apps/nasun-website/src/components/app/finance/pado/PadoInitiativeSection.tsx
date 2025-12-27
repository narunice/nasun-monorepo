import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui";

/**
 * PadoInitiativeSection 컴포넌트
 *
 * The Pado Initiative DeFi 플랫폼 소개 섹션
 * - SectionTitle, Intro, 5개 제품 카테고리, Closing
 */
function PadoInitiativeSection() {
  const { t } = useTranslation("pado");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto px-4">
        {/* Page Title */}
        <PageTitle as="h2">{t("initiative.title")}</PageTitle>

        {/* Intro Section */}
        <div className="mb-8 md:mb-10 lg:mb-12 space-y-6 ">
          <p>{t("initiative.intro")}</p>
        </div>

        {/* What We Are Building Together - Tagline */}
        <div className="mb-6 md:mb-8 lg:mb-10">
          <h3 className="text-center mb-2 md:mb-3 lg:mb-4">
            {t("initiative.buildingTogether.title")}
          </h3>
          <p className="text-center max-w-3xl mx-auto">
            {t("initiative.buildingTogether.description")}
          </p>
        </div>

        {/* Product Grid - Row 1: 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-7 lg:gap-8 mb-6 md:mb-7 lg:mb-8">
          {/* Perpetuals + Spot DEX */}
          <DividerBox
            title={t("initiative.products.perpetuals.title")}
            color="c1"
            titleClassName="text-nasun-c1"
          >
            <p>{t("initiative.products.perpetuals.description")}</p>
          </DividerBox>

          {/* Predictions Market */}
          <DividerBox
            title={t("initiative.products.predictions.title")}
            color="c2"
            titleClassName="text-nasun-c2"
          >
            <p>{t("initiative.products.predictions.description")}</p>
          </DividerBox>
        </div>

        {/* Product Grid - Row 2: Full width */}
        <div className="mb-6 md:mb-7 lg:mb-8">
          <DividerBox
            title={t("initiative.products.rwa.title")}
            color="c3"
            titleClassName="text-nasun-c3"
          >
            <p>{t("initiative.products.rwa.description")}</p>
          </DividerBox>
        </div>

        {/* Product Grid - Row 3: 2 columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-7 lg:gap-8 mb-8 md:mb-10 lg:mb-12">
          {/* Money Market */}
          <DividerBox
            title={t("initiative.products.moneyMarket.title")}
            color="c4"
            titleClassName="text-nasun-c4"
          >
            <p>{t("initiative.products.moneyMarket.description")}</p>
          </DividerBox>

          {/* Cross-Market Integrations */}
          <DividerBox
            title={t("initiative.products.crossMarket.title")}
            color="c5"
            titleClassName="text-nasun-c5"
          >
            <p>{t("initiative.products.crossMarket.description")}</p>
          </DividerBox>
        </div>

        {/* Closing Section */}
        <div className="space-y-6 border-t border-nasun-white/10 pt-8 md:pt-10">
          <p>{t("initiative.closing.p1")}</p>
          <p>{t("initiative.closing.p2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PadoInitiativeSection);
