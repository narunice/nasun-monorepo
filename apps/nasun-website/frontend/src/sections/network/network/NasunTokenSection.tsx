import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { FadeInUp } from "@/components/ui/FadeInUp";

const TOKEN_USE_KEYS = ["staking", "fee", "transfer", "governance"] as const;

function NasunTokenSection() {
  const { t } = useTranslation("tokenomics");

  return (
    <SectionLayout className="">
      <FadeInUp>
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-[410px_1fr] xl:grid-cols-[430px_1fr] gap-x-8 py-10 lg:py-12 xl:py-14">
          {/* Left: Title Section */}
          <div className="flex flex-col items-center lg:items-end text-center lg:text-right">
            <h1 className="font-medium text-nasun-white/90 max-w-[410px] md:max-w-lg lg:max-w-none leading-[1.1]">
              NSN Token
              <br />
              Four Main <br />
              Use Cases
            </h1>
            <div className="flex flex-col items-center lg:items-end justify-center text-center lg:text-right h-[180px] w-full">
              <h4 className="font-medium w-full text-nasun-c7 whitespace-pre-line py-4 lg:py-2 leading-tight">
                {t("token.subtitle")}
              </h4>
            </div>
          </div>

          {/* Right: Use Cases Cards */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {TOKEN_USE_KEYS.map((key) => (
              <DividerBox
                padding="sm"
                key={key}
                title={t(`token.uses.${key}.heading`)}
                color="nw1"
                description={t(`token.uses.${key}.description`)}
                descriptionClassName="!mb-0"
                hideDivider
                className="!bg-[#212E57]/50 !border-nasun-nw4/30 min-h-[160px] xl:min-h-[192px] flex flex-col justify-center !py-6 md:!py-8"
              />
            ))}
          </div>
        </div>
      </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default NasunTokenSection;
