import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";

function SaleHeroSection() {
  const { t } = useTranslation("sale");

  return (
    <SectionLayout className="relative w-full min-h-[55vh] flex items-center justify-center text-center">
      <div className="flex flex-col items-center justify-center text-center">
        <h1 className="leading-snug mb-3 md:mb-4 lg:mb-5">{t("title")}</h1>
        <h4 className="!font-light w-full md:w-3/4 text-center">{t("tagline")}</h4>
      </div>
    </SectionLayout>
  );
}

export default React.memo(SaleHeroSection);
