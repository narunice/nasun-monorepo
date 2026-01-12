import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../../layout/SectionLayout";
import SectionTitle from "../../../../ui/SectionTitle";

/**
 * OverviewSection - The Heist Story Overview
 *
 * Consolidated section containing:
 * - Planning Intent
 * - Summary
 */
function OverviewSection() {
  const { t } = useTranslation("heist");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        {/* Planning Intent */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("planningIntent.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("planningIntent.p1")}</p>
            <p>{t("planningIntent.p2")}</p>
          </div>
        </div>

        {/* Summary */}
        <div>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("summary.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("summary.p1")}</p>
            <p>{t("summary.p2")}</p>
            <p>{t("summary.p3")}</p>
            <p>{t("summary.p4")}</p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(OverviewSection);
