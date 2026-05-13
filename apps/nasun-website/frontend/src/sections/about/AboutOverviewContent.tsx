import { Link } from "react-router-dom";
import { useStaticTranslation as useTranslation } from "@/providers/i18n/StaticTranslationProvider";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { ButtonV3 } from "@/components/ui/button-v3";
import { OuterBox } from "@/components/ui/OuterBox";
import { PageTitle } from "@/components/ui/PageTitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Orbit, Wind, Wallet, Layers, Server, Sparkles, Users } from "lucide-react";

const AboutOverviewContent = () => {
  const { t } = useTranslation("about");

  return (
    <SectionLayout className="!max-w-5xl">
      {/* Hero */}
      <PageTitle>NASUN</PageTitle>
      <div className="text-center -mt-2 mb-8 md:mb-12">
        <p className="text-xl md:text-2xl font-medium text-nasun-white">Community-owned IP.</p>
        <p className="text-xl md:text-2xl font-medium text-nasun-white">
          Built on decentralized infrastructure.
        </p>
      </div>

      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* The Problem */}
        <section>
          <SectionTitle as="h4">{t("problem.title")}</SectionTitle>
          <div className="border-l-4 border-nasun-nw1/50 pl-6 md:pl-8 py-2 space-y-4">
            <div>
              <p className="text-lg md:text-xl text-nasun-white/90">{t("problem.line1")}</p>
              <p className="text-lg md:text-xl text-nasun-nw4">{t("problem.line2")}</p>
            </div>
            <div>
              <p className="text-lg md:text-xl text-nasun-white/90">{t("problem.line3")}</p>
              <p className="text-lg md:text-xl text-nasun-white/90">{t("problem.line4")}</p>
              <p className="text-lg md:text-xl text-nasun-white/90">{t("problem.line5")}</p>
            </div>
            <p className="text-lg md:text-xl font-medium text-nasun-white">
              {t("problem.conclusion")}
            </p>
          </div>
        </section>

        {/* The Flagships */}
        <section>
          <SectionTitle as="h4">{t("flagships.title")}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <OuterBox color="nw0" padding="sm">
              <div className="flex items-center gap-3 mb-3">
                <Orbit className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                <h6 className="font-bold text-nasun-white">Gen Sol</h6>
              </div>
              <p className="text-nasun-white/80">
                {t("flagships.genSol")}
              </p>
            </OuterBox>
            <OuterBox color="nw0" padding="sm">
              <div className="flex items-center gap-3 mb-3">
                <Wind className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                <h6 className="font-bold text-nasun-white">Nasun AI</h6>
              </div>
              <p className="text-nasun-white/80">{t("flagships.baram")}</p>
            </OuterBox>
            <OuterBox color="nw0" padding="sm">
              <div className="flex items-center gap-3 mb-3">
                <Wallet className="w-5 h-5 text-nasun-nw1 flex-shrink-0" />
                <h6 className="font-bold text-nasun-white">Pado</h6>
              </div>
              <p className="text-nasun-white/80">{t("flagships.pado")}</p>
            </OuterBox>
          </div>
          <p className="mt-5 text-nasun-white/80 text-center">
            {t("flagships.conclusion")}
          </p>
        </section>

        {/* Our Approach */}
        <section>
          <SectionTitle as="h4">{t("approach.title")}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Layers className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  {t("approach.ownershipLayer")}
                </h6>
              </div>
              <p className="text-nasun-white/80">
                {t("approach.ownershipLayerDesc")}
              </p>
            </OuterBox>
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Server className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  {t("approach.infrastructure")}
                </h6>
              </div>
              <p className="text-nasun-white/80">
                {t("approach.infrastructureDesc")}
              </p>
            </OuterBox>
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Sparkles className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  {t("approach.flagshipProjects")}
                </h6>
              </div>
              <p className="text-nasun-white/80">{t("approach.flagshipProjectsDesc")}</p>
            </OuterBox>
            <OuterBox color="nw1" padding="sm">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-nasun-nw4 flex-shrink-0" />
                <h6 className="font-medium text-nasun-white uppercase tracking-wider text-sm">
                  {t("approach.communityGovernance")}
                </h6>
              </div>
              <p className="text-nasun-white/80">{t("approach.communityGovernanceDesc")}</p>
            </OuterBox>
          </div>
        </section>

        {/* Current Stage */}
        <section>
          <SectionTitle as="h4">{t("currentStage.title")}</SectionTitle>
          <OuterBox color="nw0" padding="sm" className="!bg-gray-900">
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm md:text-base">
              <span>
                <span className="text-nasun-nw4 font-medium">{t("currentStage.devnet")}</span>{" "}
                <span className="text-nasun-white">{t("currentStage.devnetStatus")}</span>
              </span>
              <span className="text-nasun-white/30 hidden sm:inline">|</span>
              <span>
                <span className="text-nasun-nw4 font-medium">{t("currentStage.nodes")}</span>{" "}
                <span className="text-nasun-white">{t("currentStage.nodesStatus")}</span>
              </span>
              <span className="text-nasun-white/30 hidden sm:inline">|</span>
              <span>
                <span className="text-nasun-nw4 font-medium">{t("currentStage.apps")}</span>{" "}
                <span className="text-nasun-white">{t("currentStage.appsStatus")}</span>
              </span>
              <span className="text-nasun-white/30 hidden sm:inline">|</span>
              <span>
                <span className="text-nasun-nw4 font-medium">{t("currentStage.governance")}</span>{" "}
                <span className="text-nasun-white">{t("currentStage.governanceStatus")}</span>
              </span>
            </div>
          </OuterBox>
        </section>

        {/* The Vision */}
        <section className="text-center py-4 md:py-8">
          <SectionTitle as="h4">{t("vision.title")}</SectionTitle>
          <div className="space-y-1 mb-8">
            <p className="text-lg md:text-xl text-nasun-white">
              {t("vision.line1")}
            </p>
            <p className="text-lg md:text-xl text-nasun-white/70">{t("vision.line2")}</p>
            <p className="text-lg md:text-xl font-medium text-nasun-white">
              {t("vision.line3")}
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <ButtonV3 variant="nw1" size="md" asChild>
              <Link to="/wave1/battalion-nft">Battalion NFT</Link>
            </ButtonV3>
            <ButtonV3 variant="nw1" size="md" outline disabled>
              Frontiers
            </ButtonV3>
          </div>
        </section>
      </div>
    </SectionLayout>
  );
};

export default AboutOverviewContent;
