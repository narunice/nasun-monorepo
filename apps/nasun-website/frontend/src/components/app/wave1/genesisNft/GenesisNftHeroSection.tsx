import React from "react";
import { useTranslation } from "react-i18next";
import { SectionTitle } from "../../../ui/SectionTitle";
import { DividerBox } from "../../../ui/DividerBox";
import { OuterBox } from "../../../ui/OuterBox";
import { SectionLayout } from "@/components/layout/SectionLayout";

function GenesisNftHeroSection() {
  const { t } = useTranslation("sale");

  return (
    <SectionLayout className="">
      {/* Content Box - Semi-transparent container */}
      <div className="max-w-7xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto pt-28 pb-0 md:py-20 xl:py-24">
          <OuterBox color="c5" className="">
            {/* Main Title */}
            <SectionTitle
              as="h2"
              className="!font-rubik font-medium uppercase text-center mb-2 md:mb-3 lg:mb-4 xl:mb-5"
            >
              {t("foundersHero.title")}
            </SectionTitle>

            {/* Subtitle with highlight */}
            <div className="mb-1 md:mb-2 lg:mb-3">
              <span className="!font-founders  text-nasun-white font-medium !text-xl/tight !md:text-2xl/tight !xl:text-3xl/tight tracking-wide">
                {t("foundersHero.subtitleHighlight")}
              </span>{" "}
              <span className="!font-founders text-nasun-white/85 font-medium !text-xl/tight !md:text-2xl/tight !xl:text-3xl/tight tracking-wide">
                {t("foundersHero.subtitleDimmed")}
              </span>
            </div>

            <div className="mb-6 md:mb-7 lg:mb-8">
              {/* Description paragraphs */}
              <p className="text-nasun-white/85 text-sm md:text-base mb-1 md:mb-2 lg:mb-3">
                {t("foundersHero.description1")}
              </p>
              <p className="text-nasun-white/85 text-sm md:text-base mb-1 md:mb-2 lg:mb-3">
                {t("foundersHero.description2")}
              </p>{" "}
            </div>

            {/* Vision Section - DividerBox */}
            <DividerBox
              color="n1"
              title={t("foundersHero.visionTitle")}
              className="font-semibold"
              titleClassName="text-nasun-c3
               "
            >
              <p className="text-nasun-white/85 mb-4 ">{t("foundersHero.visionDescription1")}</p>
              <p className="text-nasun-white/85">{t("foundersHero.visionDescription2")}</p>
            </DividerBox>
          </OuterBox>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(GenesisNftHeroSection);
