import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import NarrativeSection from "./NarrativeSection";
import GamesSection from "./GamesSection";

function OverarchingSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overarching.title")}
        </SectionTitle>
        <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p>{t("overarching.intro")}</p>
          <p>{t("overarching.p1")}</p>
          <p>{t("overarching.p2")}</p>
          <p>{t("overarching.p3")}</p>
          <p>{t("overarching.p4")}</p>
          <p>{t("overarching.p5")}</p>
        </div>
      </div>
      <div className="mx-auto">
        <NarrativeSection />
        <GamesSection />
      </div>
    </SectionLayout>
  );
}

export default React.memo(OverarchingSection);
