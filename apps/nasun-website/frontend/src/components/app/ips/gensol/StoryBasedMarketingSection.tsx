import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function StoryBasedMarketingSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("marketing.title")}
        </SectionTitle>
        <div className="space-y-4 md:space-y-6">
          <p>{t("marketing.p1")}</p>
          <p>{t("marketing.p2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(StoryBasedMarketingSection);
