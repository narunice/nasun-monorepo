import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

const REVENUE_KEYS = ["revenueItem1", "revenueItem2", "revenueItem3"] as const;

function HowNasunWorksSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
        <div className="max-w-5xl w-full mx-auto">
          <div className="w-full md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto">
            <SectionTitle as="h4" className="font-normal uppercase">
              {t("howNasunWorks.heading")}
            </SectionTitle>

            <div className="space-y-4 md:space-y-5 lg:space-y-6">
              <p>{t("howNasunWorks.description")}</p>

              <DividerBox
                color="nw1"
                title={t("howNasunWorks.revenueSupports")}
                padding="sm"
                className="!bg-[#212E57]/50 !border-nasun-nw4/30"
                disableHover
              >
                <ul className="space-y-2 list-disc pl-5 marker:text-nasun-nw4">
                  {REVENUE_KEYS.map((key) => (
                    <li key={key}>
                      <p>{t(`howNasunWorks.${key}`)}</p>
                    </li>
                  ))}
                </ul>
              </DividerBox>

              <p className="font-medium text-nasun-white">{t("howNasunWorks.governanceNote")}</p>

              <p>{t("howNasunWorks.alignment")}</p>
            </div>
          </div>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default HowNasunWorksSection;
