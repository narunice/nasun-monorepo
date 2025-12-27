import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function PreProductionSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout title={t("riderStudio.preProduction.title")}>
      <p className="">{t("riderStudio.preProduction.description")}</p>
    </SectionLayout>
  );
}

export default React.memo(PreProductionSection);
