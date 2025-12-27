import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui";
import { OuterBox } from "@/components/ui/OuterBox";
import { Sparkles } from "lucide-react";

function PadoFeaturesArchitectureSection() {
  const { t } = useTranslation("pado");

  const tradingFeatures = t("main.trading.features", { returnObjects: true }) as string[];
  const capitalFeatures = t("main.capitalEfficiency.features", { returnObjects: true }) as string[];
  const lendingFeatures = t("main.lending.features", { returnObjects: true }) as string[];
  const paymentFeatures = t("main.payments.features", { returnObjects: true }) as string[];
  const vaultFeatures = t("main.trustModel.vaultGovernance.features", {
    returnObjects: true,
  }) as string[];

  return (
    <SectionLayout className="">
      <div className="max-w-5xl mx-auto">
        {/* ========== FEATURES SECTION (5-8) ========== */}

        {/* 5. Trading and Market Structure */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.trading.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c2 font-medium">
              {t("main.trading.subtitle")}
            </h5>
            <p className="text-nasun-white/80">
              {t("main.trading.content")}
            </p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {tradingFeatures.map((feature, index) => (
                <DividerBox key={index} color="c2">
                  <p className="text-nasun-white/80">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/70 italic">{t("main.trading.example")}</p>
          </div>
        </div>

        {/* 6. Capital Efficiency and Risk Management */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.capitalEfficiency.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c3 font-medium">
              {t("main.capitalEfficiency.subtitle")}
            </h5>
            <p className="text-nasun-white/80">
              {t("main.capitalEfficiency.content")}
            </p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {capitalFeatures.map((feature, index) => (
                <DividerBox key={index} color="c3">
                  <p className="text-nasun-white/80">{feature}</p>
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
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.lending.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <p className="text-nasun-white/80">
              {t("main.lending.content")}
            </p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {lendingFeatures.map((feature, index) => (
                <DividerBox key={index} color="c4">
                  <p className="text-nasun-white/80">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("main.lending.conclusion")}
            </p>
          </div>
        </div>

        {/* 8. Payments and Transfers */}
        <div className="mb-10 md:mb-12 lg:mb-14">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.payments.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c3 font-medium">
              {t("main.payments.subtitle")}
            </h5>
            <p className="text-nasun-white/80">
              {t("main.payments.content")}
            </p>

            {/* Features in cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              {paymentFeatures.map((feature, index) => (
                <DividerBox key={index} color="c3">
                  <p className="text-nasun-white/80">{feature}</p>
                </DividerBox>
              ))}
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("main.payments.conclusion")}
            </p>
          </div>
        </div>

        {/* ========== ARCHITECTURE SECTION (9-12) ========== */}

        {/* 9. Object-Based Financial Architecture */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.objectBased.title")}
          </SectionTitle>

          <div className="space-y-4 md:space-y-5 lg:space-y-6">
            <h5 className="text-nasun-c2 font-medium">
              {t("main.objectBased.subtitle")}
            </h5>
            <p className="text-nasun-white/80">
              {t("main.objectBased.content")}
            </p>

            {/* Object Types Grid - sub-content in boxes */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <DividerBox
                color="c2"
                titleClassName="text-nasun-c2"
                title="Collateral Objects"
                description={t("main.objectBased.objects.collateral")}
              />
              <DividerBox
                color="c2"
                titleClassName="text-nasun-c2"
                title="Position Objects"
                description={t("main.objectBased.objects.position")}
              />
              <DividerBox
                color="c2"
                titleClassName="text-nasun-c2"
                title="Market Objects"
                description={t("main.objectBased.objects.market")}
              />
            </div>

            <p className="text-nasun-white/90 font-medium">
              {t("main.objectBased.conclusion")}
            </p>
          </div>
        </div>

        {/* 10. Trust Model, Governance, and Security */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.trustModel.title")}
          </SectionTitle>

          {/* Sub-sections in cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Vault Governance */}
            <DividerBox
              color="c3"
              titleClassName="text-nasun-c3"
              title={t("main.trustModel.vaultGovernance.title")}
              description={t("main.trustModel.vaultGovernance.content")}
            >
              <ul className="space-y-2">
                {vaultFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2 text-nasun-white/80">
                    <span className="text-nasun-c3 mt-1">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </DividerBox>

            {/* Governance Path */}
            <DividerBox
              color="c3"
              titleClassName="text-nasun-c3"
              title={t("main.trustModel.governancePath.title")}
              description={t("main.trustModel.governancePath.content")}
            />

            {/* Account Recovery */}
            <DividerBox
              color="c3"
              titleClassName="text-nasun-c3"
              title={t("main.trustModel.accountRecovery.title")}
              description={t("main.trustModel.accountRecovery.content")}
            />
          </div>
        </div>

        {/* 11. Comparative Positioning */}
        <div className="mb-8 md:mb-10 lg:mb-12">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.comparative.title")}
          </SectionTitle>

          <p className="text-nasun-white/80">
            {t("main.comparative.content")}
          </p>
        </div>

        {/* 12. Summary */}
        <div className="">
          <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("main.summary.title")}
          </SectionTitle>

          <OuterBox variant="white" className="">
            <div className="flex items-center gap-3 mb-4">
              <Sparkles className="w-6 h-6 text-nasun-white" />
              <span className="text-nasun-white font-semibold text-lg">Key Takeaway</span>
            </div>
            <div className="space-y-4">
              <p className="text-nasun-white/90 font-medium">
                {t("main.summary.content")}
              </p>
              <p className="text-nasun-white/80">
                {t("main.summary.p2")}
              </p>
            </div>
          </OuterBox>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(PadoFeaturesArchitectureSection);
