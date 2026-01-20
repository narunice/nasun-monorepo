import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { JoinWhitelistButton } from "@/components/whitelist/JoinWhitelistButton";
import { Button } from "@/components/ui/button";

function KeyBenefitsSection() {
  const { t } = useTranslation("sale");

  return (
    <SectionLayout className="!pt-0 ">
      <div className="max-w-5xl mx-auto ">
        {/* Section Title - Right aligned */}
        <SectionTitle as="h3" className="text-right font-medium uppercase">
          {t("keyBenefits.title")}
        </SectionTitle>

        {/* Two Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-12 lg:mb-16">
          {/* Tokens / Multipliers Card */}
          <DividerBox
            title={t("keyBenefits.tokensCard.title")}
            color="n1"
            titleClassName="!text-nasun-c1"
            className=""
          >
            <div className="space-y-6 text-nasun-white/80">
              {/* NSN Token */}
              <p>
                <span className="text-nasun-white font-semibold">
                  {t("keyBenefits.tokensCard.nsnToken.label")}
                </span>{" "}
                - {t("keyBenefits.tokensCard.nsnToken.description")}
              </p>

              {/* GEN SOL Token */}
              <p>
                <span className="text-nasun- font-semibold text-nasun-white">
                  {t("keyBenefits.tokensCard.genSolToken.label")}
                </span>{" "}
                - {t("keyBenefits.tokensCard.genSolToken.description")}
              </p>

              {/* 4 Tiers of Rarity */}
              <div>
                <p className="font-semibold text-nasun-white mb-2">
                  {" "}
                  <span className="text-nasun-white font-semibold">
                    {t("keyBenefits.tokensCard.tiersOfRarity.label")}{" "}
                  </span>
                </p>
                <p>{t("keyBenefits.tokensCard.tiersOfRarity.description")}</p>
              </div>
            </div>
          </DividerBox>

          {/* Early Access Card */}
          <DividerBox
            title={t("keyBenefits.earlyAccessCard.title")}
            color="n1"
            titleClassName="!text-nasun-c1 "
            className=""
          >
            <div className="space-y-6 text-nasun-white/80">
              {/* First */}
              <p>
                <span className="text-nasun-white font-semibold">
                  {t("keyBenefits.earlyAccessCard.first.label")}
                </span>{" "}
                - {t("keyBenefits.earlyAccessCard.first.description")}
              </p>

              {/* Direct Communication */}
              <p>
                <span className="text-nasun-white font-semibold">
                  {t("keyBenefits.earlyAccessCard.directCommunication.label")}
                </span>{" "}
                - {t("keyBenefits.earlyAccessCard.directCommunication.description")}
              </p>

              {/* VIP */}
              <p>
                <span className="text-nasun-white font-semibold">
                  {t("keyBenefits.earlyAccessCard.vip.label")}
                </span>{" "}
                - {t("keyBenefits.earlyAccessCard.vip.description")}
              </p>

              {/* Whitelists */}
              <p>
                <span className="text-nasun-white font-semibold">
                  {t("keyBenefits.earlyAccessCard.whitelists.label")}
                </span>{" "}
                - {t("keyBenefits.earlyAccessCard.whitelists.description")}
              </p>
            </div>
          </DividerBox>
        </div>

        {/* CTA Buttons */}
        <div className="flex justify-center gap-4 md:gap-6">
          <JoinWhitelistButton
            variant="c3"
            size="lg"
            className="!font-founders uppercase font-normal tracking-wide w-[240px]"
          />
          <Button variant="c3" size="lg" disabled className="uppercase text-center w-[240px]">
            Mint Coming Soon
          </Button>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(KeyBenefitsSection);
