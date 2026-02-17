import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { FadeInUp } from "@/components/ui/FadeInUp";

const FOUNDATION_KEYS = ["t1", "t2", "t3"] as const;

function TechnicalFoundationSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
          <SectionTitle as="h4" className="font-normal uppercase">
            {t("technicalFoundation.heading")}
          </SectionTitle>

          <div className="space-y-6 md:space-y-8">
            {FOUNDATION_KEYS.map((key) => (
              <div key={key} className="border-t border-nasun-white/10 pt-4 md:pt-5">
                <p className="font-semibold text-nasun-white">{t(`technicalFoundation.${key}Title`)}</p>
                <p className="text-nasun-white/70 mt-1">{t(`technicalFoundation.${key}Desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default TechnicalFoundationSection;
