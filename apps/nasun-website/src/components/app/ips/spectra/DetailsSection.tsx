import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function DetailsSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("details.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("details.p1")}</p>
          <p>{t("details.p2")}</p>
          <p>{t("details.p3")}</p>
          <p>{t("details.p4")}</p>
          <p>{t("details.p5")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(DetailsSection);
