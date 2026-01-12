import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../../layout/SectionLayout";
import SectionTitle from "../../../../ui/SectionTitle";
import { Button } from "../../../../ui/button";

/**
 * ProductionSection - Spectra Heist Production & Business
 *
 * Consolidated section containing:
 * - Creative Challenge
 * - Commercialization
 * - NDA Contact
 */
function ProductionSection() {
  const { t } = useTranslation("spectraHeist");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        {/* Creative Challenge */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("creativeChallenge.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("creativeChallenge.p1")}</p>
          </div>
        </div>

        {/* Commercialization */}
        <div>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("commercialization.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-6">
            <p>{t("commercialization.p1")}</p>
            <p>{t("commercialization.p2")}</p>
          </div>

          {/* NDA Contact Section */}
          <div className="text-center py-8 mt-8 border-t border-nasun-white/20">
            <p className="text-lg mb-4">{t("nda.text")}</p>
            <Button variant="c1" size="lg" asChild>
              <a href="mailto:admin@nasun.io">{t("nda.button")}</a>
            </Button>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(ProductionSection);
