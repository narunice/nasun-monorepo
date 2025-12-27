// src/pages/protocol/ProtocolOverviewPage.tsx

import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../components/layout/SectionLayout";

export default function ProtocolOverviewPage() {
  const { t } = useTranslation("common");

  return (
    <SectionLayout className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 text-nasun-black dark:text-nasun-white">
          Protocol Overview
        </h1>
        <p className="text-lg text-nasun-black/70 dark:text-nasun-white/70">
          {t("comingSoon.description")}
        </p>
      </div>
    </SectionLayout>
  );
}
