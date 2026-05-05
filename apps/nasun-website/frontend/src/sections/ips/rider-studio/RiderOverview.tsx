import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";

/**
 * RiderStudioMainContent
 *
 * 통합 리팩토링된 Rider Studio 메인 컨텐츠 컴포넌트
 * RiderProcessCardsSection과 RiderOverviewContentSection을 하나로 합치고
 * 디자인 컨벤션 가이드를 준수하여 레이아웃을 구성함.
 */
export default function RiderOverview() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout className="!max-w-6xl">
      {/* 1. Page Title */}
      <PageTitle>{t("pageTitle")}</PageTitle>

      {/* Main Content Container with Design Convention Gaps */}
      <div className="flex flex-col gap-6 md:gap-8 lg:gap-10">
        {/* ========== PROCESS CARDS SECTION (From RiderProcessCardsSection) ========== */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("processCards.title")}
          </SectionTitle>

          <div className="flex flex-col gap-6">
            {/* First Row: 2 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8">
              <DividerBox title={t("processCards.screenplay.title")} color="c1">
                <p className="text-nasun-white/80">{t("processCards.screenplay.description")}</p>
              </DividerBox>

              <DividerBox title={t("processCards.development.title")} color="c1">
                <p className="text-nasun-white/80">{t("processCards.development.description")}</p>
              </DividerBox>
            </div>

            {/* Second Row: 1 full-width card */}
            <DividerBox title={t("processCards.preProduction.title")} color="c1">
              <p className="text-nasun-white/80">{t("processCards.preProduction.description")}</p>
            </DividerBox>

            {/* Third Row: 2 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-7 lg:gap-8">
              <DividerBox title={t("processCards.postProduction.title")} color="c1">
                <p className="text-nasun-white/80">
                  {t("processCards.postProduction.description")}
                </p>
              </DividerBox>

              <DividerBox title={t("processCards.marketing.title")} color="c1">
                <p className="text-nasun-white/80">{t("processCards.marketing.description")}</p>
              </DividerBox>
            </div>
          </div>
        </section>

        {/* ========== OVERVIEW CONTENT SECTIONS (From RiderOverviewContentSection) ========== */}

        {/* 2. Concept to Reality */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overview.conceptToReality.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.conceptToReality.p1")}</p>
            <p>{t("overview.conceptToReality.p2")}</p>
          </div>
        </section>

        {/* 3. Screenplay Competition */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overview.screenplayCompetition.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.screenplayCompetition.p1")}</p>
            <p>{t("overview.screenplayCompetition.p2")}</p>
            <p>{t("overview.screenplayCompetition.p3")}</p>
            <p>{t("overview.screenplayCompetition.p4")}</p>
          </div>
        </section>

        {/* 4. Development */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overview.development.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.development.p1")}</p>
            <p>{t("overview.development.p2")}</p>
            <p>{t("overview.development.p3")}</p>
          </div>
        </section>

        {/* 5. Pre-Production / Production */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overview.preProduction.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.preProduction.p1")}</p>
          </div>
        </section>

        {/* 6. Post-Production / Marketing / Distribution */}
        <section>
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overview.postProduction.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.postProduction.p1")}</p>
            <p>{t("overview.postProduction.p2")}</p>
            <p>{t("overview.postProduction.p3")}</p>
            <p>{t("overview.postProduction.p4")}</p>
          </div>
        </section>

        {/* 7. Concluding Thoughts */}
        <section className="border-t border-nasun-white/10 pt-10">
          <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
            {t("overview.concluding.title")}
          </SectionTitle>
          <div className="space-y-2 md:space-y-3 lg:space-y-4">
            <p>{t("overview.concluding.p1")}</p>
            <p>{t("overview.concluding.p2")}</p>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
}
