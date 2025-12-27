import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function NarrativeSection() {
  const { t } = useTranslation("genSol");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase text-center mb-2 md:mb-3 lg:mb-4">
          {t("narrative.title")}
        </SectionTitle>

        {/* Animation Series */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">
            {t("narrative.animation.title")}
          </h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("narrative.animation.p1")}</p>
            <p>{t("narrative.animation.p2")}</p>
            <p className="mx-4 px-4 border-l-4 border-nasun-c1 italic">
              {t("narrative.animation.p3")}
            </p>
            <p>{t("narrative.animation.p4")}</p>
          </div>
        </div>

        {/* Live-Action Show */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("narrative.liveAction.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p>{t("narrative.liveAction.p1")}</p>
            <p className="mx-4 px-4 border-l-4 border-nasun-c1 italic">
              {t("narrative.liveAction.p2")}
            </p>
            <p>{t("narrative.liveAction.p3")}</p>
            <p>{t("narrative.liveAction.p4")}</p>
          </div>
        </div>

        {/* Movies */}
        <div className="mb-8">
          <h4 className="text-xl font-semibold mb-4 md:mb-6">{t("narrative.movies.title")}</h4>
          <div className="space-y-4 md:space-y-6">
            <p className="mx-4 px-4 border-l-4 border-nasun-c1 italic">
              {t("narrative.movies.p1")}
            </p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NarrativeSection);
