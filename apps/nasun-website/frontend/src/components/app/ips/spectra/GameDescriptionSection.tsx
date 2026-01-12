import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function GameDescriptionSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("gameDescription.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("gameDescription.p1")}</p>
          <p>{t("gameDescription.p2")}</p>
          <p>{t("gameDescription.p3")}</p>
          <p>{t("gameDescription.p4")}</p>
          <p>{t("gameDescription.p5")}</p>
          <p>{t("gameDescription.p6")}</p>
          <p>{t("gameDescription.p7")}</p>
          <p>{t("gameDescription.p8")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GameDescriptionSection);
