import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function StrategySection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("strategy.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("strategy.p1")}</p>
          <p>{t("strategy.p2")}</p>
          <p>{t("strategy.p3")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(StrategySection);
