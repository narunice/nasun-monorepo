import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

/**
 * FeaturesSection - Spectra Game Features
 *
 * Consolidated section containing:
 * - Strategy
 * - Details
 * - Main Factors
 * - Tournaments
 * - Web3 Integration
 */
function FeaturesSection() {
  const { t } = useTranslation("spectra");
  const mainFactorItems = t("mainFactors.items", { returnObjects: true }) as string[];
  const tournamentItems = t("tournaments.items", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="!max-w-6xl ">
      <div className=" mx-auto">
        {/* Strategy */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("strategy.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("strategy.p1")}</p>
            <p>{t("strategy.p2")}</p>
            <p>{t("strategy.p3")}</p>
          </div>
        </div>

        {/* Details */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
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

        {/* Main Factors */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("mainFactors.title")}
          </SectionTitle>

          <div className="max-w-4xl mx-auto">
            <ul className="space-y-1 md:space-y-2 lg:space-y-3">
              {mainFactorItems.map((item, index) => (
                <li key={index} className="flex">
                  <span className="text-nasun-c1 mr-4">●</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Tournaments */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("tournaments.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("tournaments.intro")}</p>
            <div className="max-w-4xl mx-auto">
              <ul className="space-y-1 md:space-y-2 lg:space-y-3">
                {tournamentItems.map((item, index) => (
                  <li key={index} className="flex">
                    <span className="text-nasun-c1 mr-4">●</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Web3 */}
        <div>
          <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
            {t("web3.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("web3.p1")}</p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(FeaturesSection);
