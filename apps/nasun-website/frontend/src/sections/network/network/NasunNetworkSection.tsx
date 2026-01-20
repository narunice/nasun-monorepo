import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { OuterBox } from "@/components/ui/OuterBox";
import { DividerBox } from "@/components/ui/DividerBox";
import NetworkActivity from "./NetworkActivity";

function NasunNetworkSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="!max-w-6xl">
      {/* Content Box - Semi-transparent container (Founders NFT style) */}
      <div className="max-w-5xl w-full mx-auto">
        <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto py-6 xl:py-8">
          <OuterBox color="c5" padding="md">
            {/* Main Title */}
            <SectionTitle
              as="h2"
              className="font-medium uppercase text-center mb-0 md:mb-1 lg:mb-2 xl:mb-3"
            >
              {t("network.nsnTitle")}
            </SectionTitle>

            {/* Layer 1 Protocol */}
            <div className="flex flex-col gap-1 items-center mb-6 lg:mb-8">
              <h4 className="text-nasun-c3 font-semibold -mb-1">{t("network.layer1")}</h4>
              <h4 className="text-nasun-c3 font-semibold">{t("network.subtitle")}</h4>
            </div>

            <div className="mb-6 md:mb-7 lg:mb-8 xl:mb-10">
              {/* Description */}
              <p className="text-nasun-white/80 whitespace-pre-line">{t("network.description")}</p>
            </div>

            {/* Vision Section - DividerBox */}
            <DividerBox
              color="c3"
              title={t("network.visionTitle")}
              className="font-semibold  "
              titleClassName="text-nasun-c3"
            >
              <p className="text-nasun-white/80 whitespace-pre-line">
                {t("network.visionDescription")}
              </p>
            </DividerBox>

            {/* Button */}
            <div className="pt-6 md:pt-8 text-center">
              <Button variant="c3" size="lg" className="">
                {t("network.buttonText")}
              </Button>
            </div>
          </OuterBox>

          {/* Network Activity - TPS Chart & Epoch Progress */}
          <NetworkActivity />
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(NasunNetworkSection);
