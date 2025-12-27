import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function ConcludingSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout title={t("riderStudio.conclusion.title")}>
      
        <>
          <p className="">{t("riderStudio.conclusion.description1")}</p>
          <p className="">{t("riderStudio.conclusion.description2")}</p>
        </>
      
    </SectionLayout>
  );
}

export default React.memo(ConcludingSection);
