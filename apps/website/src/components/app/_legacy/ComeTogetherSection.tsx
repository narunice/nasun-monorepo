import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../layout/SectionLayout";
import { SectionTitle } from "../../ui/SectionTitle";

function ComeTogetherSection() {
  const { t } = useTranslation("strategy");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("comeTogether.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("comeTogether.paragraph1")}</p>
          <p>{t("comeTogether.paragraph2")}</p>
          <p>{t("comeTogether.paragraph3")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(ComeTogetherSection);
