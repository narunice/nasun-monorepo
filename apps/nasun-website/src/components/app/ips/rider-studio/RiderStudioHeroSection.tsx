import { useTranslation } from "react-i18next";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { SectionTitle } from "@/components/ui/SectionTitle";

export default function RiderStudioHeroSection() {
  const { t } = useTranslation("riderStudio");

  return (
    <SectionLayout className="">
      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="uppercase mb-2 md:mb-3 lg:mb-4">
          {t("hero.subtitle")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("hero.p1")}</p>
          <p>{t("hero.p2")}</p>
          <p>{t("hero.p3")}</p>
          <p>{t("hero.p4")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}
