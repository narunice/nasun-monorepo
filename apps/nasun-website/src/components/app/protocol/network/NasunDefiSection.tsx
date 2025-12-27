import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

function NasunDefiSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        {/* Title */}
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
          {t("network_details.defi.title")}
        </SectionTitle>

        {/* Intro */}
        <div className="space-y-4 md:space-y-6 mb-8 md:mb-10 lg:mb-12">
          <p>{t("network_details.defi.subtitle")}</p>
          <p>{t("network_details.defi.body1")}</p>
          <p>{t("network_details.defi.body2")}</p>
          <p>{t("network_details.defi.body3")}</p>
        </div>

        {/* List Section */}
        <div className="space-y-2 md:space-y-3 lg:space-y-4 max-w-3xl mx-auto">
          <h5 className="font-medium">{t("network_details.defi.listTitle")}</h5>
          <ul className="space-y-1 md:space-y-2 lg:space-y-3">
            {(t("network_details.defi.list_items", { returnObjects: true }) as string[]).map(
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
    </SectionLayout>
  );
}

export default React.memo(NasunDefiSection);
