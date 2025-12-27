import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function PostProductionSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout title={t("riderStudio.postProduction.title")}>
      
        <>
          <p className="">{t("riderStudio.postProduction.description1")}</p>
          <p className="">{t("riderStudio.postProduction.description2")}</p>
          <p className="">{t("riderStudio.postProduction.description3")}</p>
          <p className="">{t("riderStudio.postProduction.description4")}</p>
        </>
      
    </SectionLayout>
  );
}

export default React.memo(PostProductionSection);
