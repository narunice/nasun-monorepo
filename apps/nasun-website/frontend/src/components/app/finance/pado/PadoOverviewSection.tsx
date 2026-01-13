import React from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, Sparkles } from "lucide-react";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { PageTitle, DividerBox, Button } from "@/components/ui";
import { OuterBox } from "@/components/ui/OuterBox";

/**
 * PadoOverviewSection - "Pado: Unified Onchain Finance" Section
 *
 * Consolidated section containing:
 * - Overview (1-4): Overview, Account Model, Cross-Chain, Stablecoins
 * - Features (5-8): Trading, Capital Efficiency, Lending, Payments
 * - Architecture (9-12): Object-Based, Trust Model, Comparative, Summary
 */
function PadoOverviewSection() {
  const { t } = useTranslation("pado");

  // Overview features
  const accountFeatures = t("main.accountModel.features", { returnObjects: true }) as string[];
  const crossChainFeatures = t("main.crossChain.features", { returnObjects: true }) as string[];

  // Features section
  const tradingFeatures = t("main.trading.features", { returnObjects: true }) as string[];
  const capitalFeatures = t("main.capitalEfficiency.features", { returnObjects: true }) as string[];
  const lendingFeatures = t("main.lending.features", { returnObjects: true }) as string[];
  const paymentFeatures = t("main.payments.features", { returnObjects: true }) as string[];
  const vaultFeatures = t("main.trustModel.vaultGovernance.features", {
    returnObjects: true,
  }) as string[];

  return (
    <SectionLayout className="!pt-0 !max-w-6xl">
      {/* ========== MAIN TITLE ========== */}
      <PageTitle as="h2">{t("main.title")}</PageTitle>

      {/* Subtitle Box */}
      <OuterBox color="w1" padding="md" className="mb-8 md:mb-10 lg:mb-12">
        <p className="text-nasun-white font-medium text-lg md:text-xl text-center">
          {t("main.subtitle")}
        </p>
        <p className="max-w-[650px] mx-auto text-base md:text-lg text-center mt-3">
          {t("main.tagline")}
        </p>
        <Button
          variant="c1"
          size="lg"
          className="flex w-fit items-center gap-2 mt-4 mx-auto"
          asChild
        >
          <a href="https://staging.pado.finance/" target="_blank" rel="noopener noreferrer">
            Pado Open Alpha
            <ExternalLink className="w-4 h-4 ml-1" />
          </a>
        </Button>
      </OuterBox>

      {/* ========== OVERVIEW SECTION (1-4) ========== */}

      {/* 1. Overview Section */}
      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        <section>
          <SectionTitle as="h4" className="uppercase ">
            {t("main.overview.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4 ">
            <p className="">{t("main.overview.content")}</p>
            <p className="">{t("main.overview.p2")}</p>
            <p className="">{t("main.overview.p3")}</p>
          </div>
        </section>

        {/* 2. Account Model and User Access */}
        <section>
          <SectionTitle as="h4" className="uppercase ">
            {t("main.accountModel.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.accountModel.subtitle")}</h5>
            <p className="">{t("main.accountModel.content")}</p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {accountFeatures.map((feature, index) => (
                <DividerBox key={index} color="n1" padding="sm">
                  <p className="">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">{t("main.accountModel.conclusion")}</p>
          </div>
        </section>

        {/* 3. Cross-Chain Asset Access */}
        <section>
          <SectionTitle as="h4" className="uppercase ">
            {t("main.crossChain.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.crossChain.subtitle")}</h5>
            <p className=" ">{t("main.crossChain.content")}</p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {crossChainFeatures.map((feature, index) => (
                <DividerBox key={index} color="n1" padding="sm">
                  <p className=" ">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">{t("main.crossChain.conclusion")}</p>
          </div>
        </section>

        {/* 4. Stablecoins */}
        <section>
          <SectionTitle as="h4" className="uppercase ">
            {t("main.stablecoins.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.stablecoins.subtitle")}</h5>
            <p className=" ">{t("main.stablecoins.content")}</p>
            <p className=" ">{t("main.stablecoins.p2")}</p>
            <p className=" ">{t("main.stablecoins.p3")}</p>
          </div>
        </section>

        {/* ========== FEATURES SECTION (5-8) ========== */}

        {/* 5. Trading and Market Structure */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.trading.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.trading.subtitle")}</h5>
            <p className="">{t("main.trading.content")}</p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {tradingFeatures.map((feature, index) => (
                <DividerBox key={index} color="n1" padding="sm">
                  <p className="">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/70 italic">{t("main.trading.example")}</p>
          </div>
        </div>

        {/* 6. Capital Efficiency and Risk Management */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.capitalEfficiency.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.capitalEfficiency.subtitle")}</h5>
            <p className="">{t("main.capitalEfficiency.content")}</p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {capitalFeatures.map((feature, index) => (
                <DividerBox key={index} color="n1" padding="sm">
                  <p className="">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("main.capitalEfficiency.conclusion")}
            </p>
          </div>
        </div>

        {/* 7. Lending, Borrowing, and Staking */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.lending.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p className="">{t("main.lending.content")}</p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {lendingFeatures.map((feature, index) => (
                <DividerBox key={index} color="n1" padding="sm">
                  <p className="">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">{t("main.lending.conclusion")}</p>
          </div>
        </div>

        {/* 8. Payments and Transfers */}
        <div className="mb-10 md:mb-12 lg:mb-14">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.payments.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.payments.subtitle")}</h5>
            <p className="">{t("main.payments.content")}</p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {paymentFeatures.map((feature, index) => (
                <DividerBox key={index} color="n1" padding="sm">
                  <p className="">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">{t("main.payments.conclusion")}</p>
          </div>
        </div>

        {/* ========== ARCHITECTURE SECTION (9-12) ========== */}

        {/* 9. Object-Based Financial Architecture */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.objectBased.title")}
          </SectionTitle>

          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <h5 className="text-nasun-c1 font-medium">{t("main.objectBased.subtitle")}</h5>
            <p className="">{t("main.objectBased.content")}</p>

            {/* Object Types Grid - sub-content in boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <DividerBox
                color="c1"
                titleClassName="text-nasun-n1"
                title="Collateral Objects"
                description={t("main.objectBased.objects.collateral")}
              />
              <DividerBox
                color="c1"
                titleClassName="text-nasun-n1"
                title="Position Objects"
                description={t("main.objectBased.objects.position")}
              />
              <DividerBox
                color="c1"
                titleClassName="text-nasun-n1"
                title="Market Objects"
                description={t("main.objectBased.objects.market")}
              />
            </div>

            <p className="text-nasun-white/90 font-medium">{t("main.objectBased.conclusion")}</p>
          </div>
        </div>

        {/* 10. Trust Model, Governance, and Security */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.trustModel.title")}
          </SectionTitle>

          {/* Sub-sections in cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vault Governance */}
            <DividerBox
              color="c1"
              titleClassName="text-nasun-n1"
              title={t("main.trustModel.vaultGovernance.title")}
              description={t("main.trustModel.vaultGovernance.content")}
            >
              <ul className="space-y-2">
                {vaultFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-nasun-white/80">
                    <span className="text-nasun-n1 mt-1">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </DividerBox>

            {/* Governance Path */}
            <DividerBox
              color="c1"
              titleClassName="text-nasun-n1"
              title={t("main.trustModel.governancePath.title")}
              description={t("main.trustModel.governancePath.content")}
            />

            {/* Account Recovery */}
            <DividerBox
              color="c1"
              titleClassName="text-nasun-n1"
              title={t("main.trustModel.accountRecovery.title")}
              description={t("main.trustModel.accountRecovery.content")}
            />
          </div>
        </div>

        {/* 11. Comparative Positioning */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.comparative.title")}
          </SectionTitle>

          <p className="">{t("main.comparative.content")}</p>
        </div>

        {/* 12. Summary */}
        <div className="">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.summary.title")}
          </SectionTitle>

          <OuterBox color="c3" className="">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-nasun-white" />
              <span className="text-nasun-white font-semibold text-lg">Key Takeaway</span>
            </div>
            <div className="space-y-4">
              <p className="text-nasun-white/90 font-medium">{t("main.summary.content")}</p>
              <p className="">{t("main.summary.p2")}</p>
            </div>
          </OuterBox>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PadoOverviewSection);
