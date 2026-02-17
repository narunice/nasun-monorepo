import { useTranslation } from "react-i18next";
import { ButtonV3 } from "@/components/ui/button-v3";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

const LAYERS = [
  {
    emoji: "\uD83D\uDD12",
    titleKey: "network.layer1Title",
    descKey: "network.layer1Desc",
    color: "nw3" as const,
  },
  {
    emoji: "\u26A1",
    titleKey: "network.layer2Title",
    descKey: "network.layer2Desc",
    color: "nw1" as const,
  },
  {
    emoji: "\uD83C\uDFAE",
    titleKey: "network.layer3Title",
    descKey: "network.layer3Desc",
    color: "white" as const,
  },
] as const;

function NasunNetworkSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
        {/* Content Box */}
        <div className="max-w-5xl w-full mx-auto">
          <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto py-6 xl:py-8">
            <OuterBox color="nw0" padding="md">
              {/* Main Title */}
              <SectionTitle
                as="h2"
                className="font-medium uppercase text-center mb-0 md:mb-1 lg:mb-2 xl:mb-3"
              >
                {t("network.nsnTitle")}
              </SectionTitle>

              <div className="mb-6 md:mb-7 lg:mb-8 xl:mb-10">
                <p className="text-nasun-white/80 whitespace-pre-line">
                  {t("network.description")}
                </p>
              </div>

              {/* Three-Layer Model */}
              <h4 className="font-normal mb-4 md:mb-5 uppercase">{t("network.threeLayerModel")}</h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                {LAYERS.map((layer) => (
                  <DividerBox
                    key={layer.titleKey}
                    title={t(layer.titleKey)}
                    icon={<span>{layer.emoji}</span>}
                    description={t(layer.descKey)}
                    color={layer.color}
                    className="!bg-black/50"
                    padding="sm"
                    disableHover
                  />
                ))}
              </div>

              <h6 className="font-semibold text-nasun-white/90 mt-5 md:mt-6 text-center">
                {t("network.communityBuilds")}
              </h6>

              {/* Button */}
              <div className="pt-6 md:pt-8 text-center">
                <ButtonV3 variant="gradientDark" size="md">
                  {t("network.buttonText")}
                </ButtonV3>
              </div>
            </OuterBox>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default NasunNetworkSection;
