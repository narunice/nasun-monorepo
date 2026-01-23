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
          <OuterBox color="c5" padding="md" className="!border-nasun-c4/50 !bg-[#212E57]/50">
            {/* Main Title */}
            <SectionTitle
              as="h2"
              className="font-medium uppercase text-center mb-0 md:mb-1 lg:mb-2 xl:mb-3"
            >
              {t("network.nsnTitle")}
            </SectionTitle>

            <div className="mb-6 md:mb-7 lg:mb-8 xl:mb-10">
              {/* Description */}
              <p className="text-nasun-white/80 whitespace-pre-line">{t("network.description")}</p>
            </div>

            {/* Vision Section - DividerBox */}
            <DividerBox color="c4" disableHover={true} className="font-semibold bg-nasun-c4/10">
              <p>{t("network.visionDescription")}</p>
            </DividerBox>

            {/* Button */}
            <div className="pt-6 md:pt-8 text-center">
              <Button
                variant="c4"
                size="lg"
                className="!bg-gradient-to-r !from-nasun-c4 !to-nasun-c3 text-nasun-black"
              >
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
