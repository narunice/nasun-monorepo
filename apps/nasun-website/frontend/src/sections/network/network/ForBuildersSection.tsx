import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FadeInUp } from "@/components/ui/FadeInUp";

function ForBuildersSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            {t("forBuilders.heading")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <div>
              <p>
                <span className="font-semibold text-nasun-white">{t("forBuilders.usersLabel")}</span> {t("forBuilders.usersDesc")}
              </p>
              <p>
                <span className="font-semibold text-nasun-white">{t("forBuilders.developersLabel")}</span> {t("forBuilders.developersDesc")}
              </p>
            </div>

            <p>{t("forBuilders.intentional")}</p>
          </div>

          <SectionTitle as="h4" className="font-normal uppercase mt-10 md:mt-12 lg:mt-16">
            {t("forBuilders.investorsHeading")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="font-semibold text-nasun-white">
              {t("forBuilders.investorsDesc")}
            </p>
            <ButtonV3
              variant="nw4"
              outline
              size="sm"
              asChild
            >
              <a href="mailto:admin@nasun.io">{t("forBuilders.contactUs")}</a>
            </ButtonV3>
          </div>
        </div>
      </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default ForBuildersSection;
