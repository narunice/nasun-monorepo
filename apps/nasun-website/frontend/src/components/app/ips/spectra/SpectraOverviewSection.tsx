import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { OuterBox } from "@/components/ui";

function SpectraOverviewSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h4" className="mb-2 md:mb-3 lg:mb-4">
          {t("overview.title")}
        </SectionTitle>

        {/* Game Specifications */}

        <OuterBox color="n1" className="mb-2 md:mb-4 lg:mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-nasun-white/80">
            <div>
              <span className="text-nasun-c1 font-medium">Genre:</span> {t("overview.specs.genre")}
            </div>
            <div>
              <span className="text-nasun-c1 font-medium">Player Perspective:</span>{" "}
              {t("overview.specs.perspective")}
            </div>
            <div>
              <span className="text-nasun-c1 font-medium">Number of Players:</span>{" "}
              {t("overview.specs.players")}
            </div>
            <div>
              <span className="text-nasun-c1 font-medium">Setting:</span>{" "}
              {t("overview.specs.setting")}
            </div>
            <div className="md:col-span-2">
              <span className="text-nasun-c1 font-medium">Visual Style:</span>{" "}
              {t("overview.specs.visualStyle")}
            </div>
          </div>
        </OuterBox>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.p1")}</p>
          <p>{t("overview.p2")}</p>
          <p>{t("overview.p3")}</p>
          <p>{t("overview.p4")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(SpectraOverviewSection);
