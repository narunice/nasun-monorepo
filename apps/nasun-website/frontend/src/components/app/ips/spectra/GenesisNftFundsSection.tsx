import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";

interface CategoryData {
  title: string;
  items: string[];
}

function GenesisNftFundsSection() {
  const { t } = useTranslation("spectra");

  const categoryKeys = [
    "serverBackend",
    "awsSetup",
    "alienSoldier",
    "aerioWeapons",
    "raidersWeapon",
    "weaponParticles",
    "environment",
    "gameImplementation",
    "creatureMugox",
  ];

  const categories = categoryKeys
    .map((key) => {
      const data = t(`foundersNftFunds.categories.${key}` as any, { // eslint-disable-line @typescript-eslint/no-explicit-any
        returnObjects: true,
      }) as unknown as CategoryData;

      if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
        return null;
      }
      return { key, data };
    })
    .filter((c): c is { key: string; data: CategoryData } => c !== null);

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("foundersNftFunds.title")}
        </SectionTitle>

        <div className="space-y-6 md:space-y-8">
          {categories.map(({ key, data }) => (
            <div key={key}>
              <h4 className="text-lg font-semibold mb-2 md:mb-3">{data.title}</h4>
              <div className="max-w-3xl mx-auto">
                <ul className="space-y-1 md:space-y-2 lg:space-y-3">
                  {data.items.map((item, index) => (
                    <li key={index} className="flex">
                      <span className="text-nasun-c1 mr-4">●</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GenesisNftFundsSection);
