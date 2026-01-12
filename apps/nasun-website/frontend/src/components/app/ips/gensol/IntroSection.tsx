import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { PageTitle } from "@/components/ui";

/**
 * IntroSection - GenSol Overview Introduction
 *
 * Consolidated section containing:
 * - Page Title
 * - Korean Connection
 * - Story-Based Marketing
 * - Global Market
 */
function IntroSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      {/* Page Title */}
      <PageTitle>{t("pageTitle")}</PageTitle>

      <div className="max-w-4xl mx-auto">
        {/* Korean Connection */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("koreanConnection.title")}
          </SectionTitle>
          <div className="space-y-4 md:space-y-6">
            <p>{t("koreanConnection.p1")}</p>
            <p>{t("koreanConnection.p2")}</p>
          </div>
        </div>

        {/* Story-Based Marketing */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("marketing.title")}
          </SectionTitle>
          <div className="space-y-4 md:space-y-6">
            <p>{t("marketing.p1")}</p>
            <p>{t("marketing.p2")}</p>
          </div>
        </div>

        {/* Global Market */}
        <div>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("globalMarket.title")}
          </SectionTitle>
          <div className="space-y-4 md:space-y-6">
            <p>{t("globalMarket.p1")}</p>
            <p>{t("globalMarket.p2")}</p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(IntroSection);
