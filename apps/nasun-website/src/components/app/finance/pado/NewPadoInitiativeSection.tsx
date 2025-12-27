import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PageTitle } from "@/components/ui";

function NewPadoInitiativeSection() {
  const { t } = useTranslation("pado");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        {/* Title */}
        <PageTitle as="h2" className="mb-2 md:mb-3 lg:mb-4">
          {t("overview.title")}
        </PageTitle>

        {/* Intro */}
        <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p>{t("overview.intro.p1")}</p>
          <p>{t("overview.intro.p2")}</p>
          <p>{t("overview.intro.p3")}</p>
        </div>

        {/* Main Products Section */}
        <div className="space-y-8 md:space-y-10 lg:space-y-12">
          <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
            {t("overview.coreInfra.title")}
          </SectionTitle>

          {/* Perpetuals + Spot DEX */}
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="font-medium">{t("overview.coreInfra.perpetuals.title")}</h5>
            <p>{t("overview.coreInfra.perpetuals.description")}</p>
          </div>

          {/* Real-World Asset (RWA) Infrastructure */}
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="font-medium">{t("overview.coreInfra.rwa.title")}</h5>
            <p>{t("overview.coreInfra.rwa.description")}</p>
          </div>

          {/* Cross-Market Integrations & Institutional Features */}
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="font-medium">{t("overview.coreInfra.crossMarket.title")}</h5>
            <p>{t("overview.coreInfra.crossMarket.description")}</p>
          </div>
          {/* Closing */}

          <div className="mt-10 md:mt-12 lg:mt-14 space-y-4 md:space-y-6 border-t border-nasun-white/10 pt-8 md:pt-10">
            <div>
              <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
                {t("overview.closing.title")}
              </SectionTitle>
            </div>
            <p>{t("overview.closing.p1")}</p>
            <p>{t("overview.closing.p2")}</p>
            <p>{t("overview.closing.p3")}</p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NewPadoInitiativeSection);
