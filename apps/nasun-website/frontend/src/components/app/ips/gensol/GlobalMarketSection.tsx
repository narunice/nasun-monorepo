import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function GlobalMarketSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("globalMarket.title")}
        </SectionTitle>
        <div className="space-y-4 md:space-y-6">
          <p>{t("globalMarket.p1")}</p>
          <p>{t("globalMarket.p2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GlobalMarketSection);
