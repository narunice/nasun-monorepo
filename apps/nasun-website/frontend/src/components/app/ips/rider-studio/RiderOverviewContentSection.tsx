import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useTranslation } from "react-i18next";

export default function RiderOverviewContentSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout className="!max-w-6xl">
      {/* Section 1: Concept to Reality */}
      <div className="mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overview.conceptToReality.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.conceptToReality.p1")}</p>
          <p>{t("overview.conceptToReality.p2")}</p>
        </div>
      </div>

      {/* Section 2: Screenplay Competition $100,000 */}
      <div className="mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overview.screenplayCompetition.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.screenplayCompetition.p1")}</p>
          <p>{t("overview.screenplayCompetition.p2")}</p>
          <p>{t("overview.screenplayCompetition.p3")}</p>
          <p>{t("overview.screenplayCompetition.p4")}</p>
        </div>
      </div>

      {/* Section 3: Development */}
      <div className="mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overview.development.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.development.p1")}</p>
          <p>{t("overview.development.p2")}</p>
          <p>{t("overview.development.p3")}</p>
        </div>
      </div>

      {/* Section 4: Pre-Production / Production */}
      <div className="mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overview.preProduction.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.preProduction.p1")}</p>
        </div>
      </div>

      {/* Section 5: Post-Production / Marketing / Distribution */}
      <div className="mb-8 md:mb-10 lg:mb-12">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overview.postProduction.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.postProduction.p1")}</p>
          <p>{t("overview.postProduction.p2")}</p>
          <p>{t("overview.postProduction.p3")}</p>
          <p>{t("overview.postProduction.p4")}</p>
        </div>
      </div>

      {/* Section 6: Concluding Thoughts */}
      <div className="border-t border-nasun-white/10 pt-10">
        <SectionTitle as="h4" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("overview.concluding.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("overview.concluding.p1")}</p>
          <p>{t("overview.concluding.p2")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}
