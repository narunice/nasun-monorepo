import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FadeInUp } from "@/components/ui/FadeInUp";

function ForBuildersSection() {
  const { t } = useTranslation("common");

  return (
    <SectionLayout maxWidth="6xl">
      <FadeInUp>
        <div className="max-w-5xl w-full mx-auto flex flex-col sm:flex-row items-center justify-center gap-4">
          <ButtonV3 variant="nw1" size="lg" asChild className="w-64 justify-center">
            <Link
              to={import.meta.env.VITE_DEVNET_EXPLORER_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("forBuilders.openDevnet")}
              <ArrowUpRight className="ml-1.5 size-4 shrink-0" />
            </Link>
          </ButtonV3>
          <ButtonV3 variant="nw1" outline size="lg" asChild className="w-64 justify-center">
            <Link to="/network/governance">{t("forBuilders.governance")}</Link>
          </ButtonV3>
        </div>
      </FadeInUp>
    </SectionLayout>
  );
}

export default ForBuildersSection;
