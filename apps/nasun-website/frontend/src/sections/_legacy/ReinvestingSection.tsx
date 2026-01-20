import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";

function ReinvestingSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto px-4">
        {/* Title */}
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("network_details.reinvesting.title")}
        </SectionTitle>

        {/* Content */}
        <div className="space-y-6">
          <p>{t("network_details.reinvesting.body1")}</p>
          <p>{t("network_details.reinvesting.body2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(ReinvestingSection);
