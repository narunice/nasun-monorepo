import React from "react";
import { useTranslation } from "react-i18next";
import { SectionLayout } from "../../../layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import SectionTitle from "@/components/ui/SectionTitle";
import progressVideo from "@/assets/videos/Progress-Video-rf28.mp4";

function CommunityEngagementSection() {
  const { t } = useTranslation("spectra");

  return (
    <SectionLayout className="">
      <PageTitle> {t("pageTitle")}</PageTitle>

      <div className="max-w-4xl mx-auto -mt-4 mb-6">
        <video
          src={progressVideo}
          autoPlay
          loop
          muted
          playsInline
          controls
          className="w-full rounded-lg"
        />
      </div>

      <div className="max-w-4xl mx-auto">
        <SectionTitle as="h3" className="pt-2 mb-2 md:mb-3 lg:mb-4">
          {t("communityEngagement.title")}
        </SectionTitle>

        <div className="space-y-4 md:space-y-6">
          <p>{t("communityEngagement.p1")}</p>
          <p>{t("communityEngagement.p2")}</p>
          <p>{t("communityEngagement.p3")}</p>
        </div>
      </div>
    </SectionLayout>
  );
}

export default React.memo(CommunityEngagementSection);
