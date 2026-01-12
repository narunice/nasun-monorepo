import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { useTranslation } from "react-i18next";
import { FadeInUp } from "@/components/ui/FadeInUp";

export default function RiderProcessCardsSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout className="">
      <div className="max-w-5xl mx-auto">
        <FadeInUp>
          <PageTitle>{t("pageTitle")}</PageTitle>
        </FadeInUp>
        <FadeInUp>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("processCards.title")}
          </SectionTitle>
          {/* First Row: 2 cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8 mb-6">
            <DividerBox
              title={t("processCards.screenplay.title")}
              color="c1"
              titleClassName="text-nasun-c1"
            >
              <p className="text-nasun-white/80">{t("processCards.screenplay.description")}</p>
            </DividerBox>

            <DividerBox
              title={t("processCards.development.title")}
              color="c2"
              titleClassName="text-nasun-c2"
            >
              <p className="text-nasun-white/80">{t("processCards.development.description")}</p>
            </DividerBox>
          </div>
          {/* Second Row: 1 full-width card */}
          <div className="mb-6">
            <DividerBox
              title={t("processCards.preProduction.title")}
              color="c3"
              titleClassName="text-nasun-c3"
            >
              <p className="text-nasun-white/80">{t("processCards.preProduction.description")}</p>
            </DividerBox>
          </div>
          {/* Third Row: 2 cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8">
            <DividerBox
              title={t("processCards.postProduction.title")}
              color="c4"
              titleClassName="text-nasun-c4"
            >
              <p className="text-nasun-white/80">{t("processCards.postProduction.description")}</p>
            </DividerBox>

            <DividerBox
              title={t("processCards.marketing.title")}
              color="c5"
              titleClassName="text-nasun-c5"
            >
              <p className="text-nasun-white/80">{t("processCards.marketing.description")}</p>
            </DividerBox>
          </div>
        </FadeInUp>
      </div>
    </SectionLayout>
  );
}
