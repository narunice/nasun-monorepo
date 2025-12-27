import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function InflationSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto px-4">
        {/* Title */}
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("network_details.inflation.title")}
        </SectionTitle>

        {/* Intro */}
        <div className="space-y-6">
          <p>{t("network_details.inflation.body1")}</p>
        </div>

        {/* List Section */}
        <div className="max-w-3xl mx-auto">
          <div className="my-6">
            <ul className="space-y-1 md:space-y-2 lg:space-y-3">
              {(t("network_details.inflation.list_items", { returnObjects: true }) as string[]).map(
                (item, index) => (
                  <li key={index} className="flex">
                    <span className="text-nasun-c1 mr-4">●</span>
                    <span>{item}</span>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>

        {/* Conclusion */}
        <div className="space-y-6">
          <p>{t("network_details.inflation.body2")}</p>
          <p>{t("network_details.inflation.body3")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(InflationSection);
