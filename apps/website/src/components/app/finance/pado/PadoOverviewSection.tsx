import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PageTitle, DividerBox } from "@/components/ui";
import { OuterBox } from "@/components/ui/OuterBox";

function PadoOverviewSection() {
  const { t } = useTranslation("pado");

  const accountFeatures = t("main.accountModel.features", { returnObjects: true }) as string[];
  const crossChainFeatures = t("main.crossChain.features", { returnObjects: true }) as string[];

  return (
    <SectionLayout className="">
      <div className="max-w-5xl mx-auto">
        {/* Main Title */}
        <PageTitle as="h2" className=" uppercase mb-2 md:mb-3 lg:mb-4">
          {t("main.title")}
        </PageTitle>

        {/* Subtitle Box */}
        <OuterBox variant="white" className="mb-8 md:mb-10 lg:mb-12">
          <p className="text-nasun-white font-medium text-lg md:text-xl text-center">
            {t("main.subtitle")}
          </p>
          <p className="text-nasun-white/80 max-w-[650px] mx-auto text-base md:text-lg text-center mt-3">
            {t("main.tagline")}
          </p>
        </OuterBox>

        {/* 1. Overview Section */}
        <div className="mb-8 md:mb-10 lg:mb-12 ">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.overview.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="text-nasun-white/80">
              {t("main.overview.content")}
            </p>
            <p className="text-nasun-white/80">
              {t("main.overview.p2")}
            </p>
            <p className="text-nasun-white/80">
              {t("main.overview.p3")}
            </p>
          </div>
        </div>

        {/* 2. Account Model and User Access */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.accountModel.title")}
          </SectionTitle>
          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c3 font-medium">
              {t("main.accountModel.subtitle")}
            </h5>
            <p className="text-nasun-white/80">
              {t("main.accountModel.content")}
            </p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {accountFeatures.map((feature, index) => (
                <DividerBox key={index} color="c3">
                  <p className="text-nasun-white/80">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("main.accountModel.conclusion")}
            </p></div>
        </div>

        {/* 3. Cross-Chain Asset Access */}
        <div className="mb-10 md:mb-12 lg:mb-14">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.crossChain.title")}
          </SectionTitle>
          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c4 font-medium">
              {t("main.crossChain.subtitle")}
            </h5>
            <p className="text-nasun-white/80 ">
              {t("main.crossChain.content")}
            </p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {crossChainFeatures.map((feature, index) => (
                <DividerBox key={index} color="c4">
                  <p className="text-nasun-white/80 ">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("main.crossChain.conclusion")}
            </p></div>
        </div>

        {/* 4. Stablecoins */}
        <div className="">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.stablecoins.title")}
          </SectionTitle>


          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c1 font-medium">
              {t("main.stablecoins.subtitle")}
            </h5>
            <p className="text-nasun-white/80 ">
              {t("main.stablecoins.content")}
            </p>
            <p className="text-nasun-white/80 ">
              {t("main.stablecoins.p2")}
            </p>
            <p className="text-nasun-white/80 ">
              {t("main.stablecoins.p3")}
            </p>
          </div>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PadoOverviewSection);
