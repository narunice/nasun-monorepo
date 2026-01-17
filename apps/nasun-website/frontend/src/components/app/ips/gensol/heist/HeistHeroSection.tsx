import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../../layout/SectionLayout";
import SectionTitle from "../../../../ui/SectionTitle";
import { Button } from "../../../../ui/button";
import { PageTitle } from "@/components/ui";

/**
 * HeistHeroSection - Consolidated Hero Section for The Heist Animation Page
 *
 * Combines:
 * - OverviewSection (Planning Intent + Summary)
 * - CharactersSection (Josen + Naro)
 * - ProductionSection (Creative Challenge + Commercialization + NDA)
 *
 * Following page-design-convention.md guidelines.
 */
function HeistHeroSection() {
  const { t } = useTranslation("heist");

  return (
    <SectionLayout className="!max-w-6xl ">
      <PageTitle className="normal-case">{t("pageTitle")}</PageTitle>
      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* Planning Intent */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("planningIntent.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p className="text-lg font-light leading-relaxed text-nasun-white/90">
              {t("planningIntent.p1")}
            </p>
            <p>{t("planningIntent.p2")}</p>
          </div>
        </section>

        {/* Summary */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("summary.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("summary.p1")}</p>
            <p>{t("summary.p2")}</p>
            <p>{t("summary.p3")}</p>
            <p className="italic">{t("summary.p4")}</p>
          </div>
        </section>

        {/* Characters */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("characters.title")}
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 md:mt-3 lg:mt-4">
            {/* Josen */}
            <div className="flex gap-4">
              <div className="w-0.5 bg-nasun-c1 flex-shrink-0" />
              <div className="space-y-2">
                <h5 className="text-base font-semibold text-nasun-white">
                  {t("characters.josen.name")}
                </h5>
                <p>{t("characters.josen.description")}</p>
              </div>
            </div>

            {/* Naro */}
            <div className="flex gap-4">
              <div className="w-0.5 bg-nasun-c1 flex-shrink-0" />
              <div className="space-y-2">
                <h5 className="text-base font-semibold text-nasun-white">
                  {t("characters.naro.name")}
                </h5>
                <p>{t("characters.naro.description")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Creative Challenge */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("creativeChallenge.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("creativeChallenge.p1")}</p>
          </div>
        </section>

        {/* Commercialization */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("commercialization.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("commercialization.p1")}</p>
            <p>{t("commercialization.p2")}</p>
          </div>
        </section>

        {/* NDA Contact */}
        <section className="text-center py-6 md:py-8 border-t border-nasun-white/20">
          <p className="text-lg font-light leading-relaxed text-nasun-white/90 mb-4 md:mb-6">
            {t("nda.text")}
          </p>
          <Button variant="c1" size="lg" asChild>
            <a href="mailto:admin@nasun.io">{t("nda.button")}</a>
          </Button>
        </section>
      </div>
    </SectionLayout>
  );
}

export default React.memo(HeistHeroSection);
