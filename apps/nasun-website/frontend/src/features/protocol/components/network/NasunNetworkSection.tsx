import React from "react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { Button } from "../../../ui/button";
import { SectionLayout } from "../../../layout/SectionLayout";
import { SectionTitle } from "../../../ui/SectionTitle";
import { OuterBox } from "../../../ui/OuterBox";
import { DividerBox } from "../../../ui/DividerBox";

function NasunNetworkSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout>
      {/* Content Box - Semi-transparent container (Founders NFT style) */}
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto py-10 xl:py-12">
          <OuterBox color="n1" className="">
            {/* Main Title */}
            <SectionTitle
              as="h2"
              className="font-medium uppercase text-center mb-2 md:mb-3 lg:mb-4 xl:mb-5"
            >
              {t("network.nsnTitle")}
            </SectionTitle>

            {/* Layer 1 Protocol */}
            <div className="flex flex-col gap-1 items-center mb-6 lg:mb-8">
              <h4 className="text-nasun-c3/90 font-semibold -mb-1">{t("network.layer1")}</h4>
              <h4 className="text-nasun-c3/90 font-semibold">{t("network.subtitle")}</h4>
            </div>

            <div className="mb-6 md:mb-7 lg:mb-8 xl:mb-10">
              {/* Description */}
              <p className="text-nasun-white/80 whitespace-pre-line">{t("network.description")}</p>
            </div>

            {/* Vision Section - DividerBox */}
            <DividerBox
              color="c3"
              title={t("network.visionTitle")}
              className="font-semibold"
              titleClassName="text-nasun-c3"
            >
              <p className="text-nasun-white/80 whitespace-pre-line">
                {t("network.visionDescription")}
              </p>
            </DividerBox>

            {/* Button */}
            <div className="pt-6 md:pt-8 text-center">
              <Button variant="c3" size="xl" className="">
                {t("network.buttonText")}
              </Button>
            </div>
          </OuterBox>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NasunNetworkSection);
