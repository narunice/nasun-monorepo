import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function DevelopmentSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout title={t("riderStudio.development.title")}>
      
        <>
          <p className="">{t("riderStudio.development.description1")}</p>
          <p className="">{t("riderStudio.development.description2")}</p>
          <p className="">{t("riderStudio.development.description3")}</p>
        </>
      
    </SectionLayout>
  );
}

export default React.memo(DevelopmentSection);
