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

  const categories: { key: string; data: CategoryData }[] = [
    { key: "serverBackend", data: t("foundersNftFunds.categories.serverBackend", { returnObjects: true }) as CategoryData },
    { key: "awsSetup", data: t("foundersNftFunds.categories.awsSetup", { returnObjects: true }) as CategoryData },
    { key: "alienSoldier", data: t("foundersNftFunds.categories.alienSoldier", { returnObjects: true }) as CategoryData },
    { key: "aerioWeapons", data: t("foundersNftFunds.categories.aerioWeapons", { returnObjects: true }) as CategoryData },
    { key: "raidersWeapon", data: t("foundersNftFunds.categories.raidersWeapon", { returnObjects: true }) as CategoryData },
    { key: "weaponParticles", data: t("foundersNftFunds.categories.weaponParticles", { returnObjects: true }) as CategoryData },
    { key: "environment", data: t("foundersNftFunds.categories.environment", { returnObjects: true }) as CategoryData },
    { key: "gameImplementation", data: t("foundersNftFunds.categories.gameImplementation", { returnObjects: true }) as CategoryData },
    { key: "creatureMugox", data: t("foundersNftFunds.categories.creatureMugox", { returnObjects: true }) as CategoryData },
  ];

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="mb-2 md:mb-3 lg:mb-4">
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
