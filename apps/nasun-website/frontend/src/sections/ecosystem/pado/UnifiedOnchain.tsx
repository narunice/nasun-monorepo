import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Layers,
  Users,
  Bot,
  ShieldCheck,
  Crown,
  Building2,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/useIsMobile";
const padoUiVideoDesktop = "/videos/Pado-Ui-Full-rf28.mp4";
const padoUiVideoMobile = "/videos/Pado-Ui-Full-mobile-rf28.mp4";

export const UnifiedOnchain = () => {
  const isMobile = useIsMobile();
  const padoUiVideo = isMobile ? padoUiVideoMobile : padoUiVideoDesktop;
  const { t } = useTranslation("pado");

  const howItWorksFeatures = t("howItWorks.features", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const riskModes = t("riskLevel.modes", { returnObjects: true }) as Array<{
    title: string;
    label: string;
    description: string;
  }>;

  const devnetItems = t("liveNow.devnet.items", { returnObjects: true }) as string[];
  const testnetItems = t("liveNow.testnet.items", { returnObjects: true }) as string[];

  const whatYouGet = t("earlyAccess.whatYouGet", { returnObjects: true }) as string[];

  const howItWorksIcons = [Layers, Users, Bot];
  const riskIcons = [ShieldCheck, Crown, Building2];

  return (
    <SectionLayout className="!pt-0 !max-w-6xl">
      <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
        {/* ===== Section 1: One Account for Everything ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("oneAccount.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1">
            <p className="text-nasun-white/70 mb-4">{t("oneAccount.intro")}</p>
          </FadeInUp>
          <FadeInUp delay="0.15">
            <OuterBox color="nw0" padding="md">
              <div className="space-y-5">
                <div>
                  <h6 className="text-nasun-nw4 font-semibold mb-1">
                    {t("oneAccount.problemLabel")}
                  </h6>
                  <p className="leading-relaxed">{t("oneAccount.problem")}</p>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-nasun-nw4/20 to-transparent" />
                <div>
                  <h6 className="text-nasun-nw4 font-semibold mb-1">
                    {t("oneAccount.solutionLabel")}
                  </h6>
                  <p className="leading-relaxed">{t("oneAccount.solution")}</p>
                </div>
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ===== Section 2: How It Works ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("howItWorks.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {howItWorksFeatures.map((feat, i) => {
              const Icon = howItWorksIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.1 + i * 0.05}`}>
                  <DividerBox
                    color="nw1"
                    hideDivider
                    padding="sm"
                    title={feat.title}
                    icon={<Icon className="w-5 h-5 text-nasun-nw4" />}
                    titleClassName="!text-nasun-nw4"
                    className="h-full"
                  >
                    <p>{feat.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 3: Choose Your Risk Level ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("riskLevel.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {riskModes.map((mode, i) => {
              const Icon = riskIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.1 + i * 0.05}`}>
                  <DividerBox color="nw0" hideDivider padding="sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-5 h-5 text-nasun-nw4" />
                      <h6 className="font-medium">{mode.title}</h6>
                      {mode.label && (
                        <span className="text-xs text-nasun-nw4/60">({mode.label})</span>
                      )}
                    </div>
                    <p>{mode.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay="0.3">
            <p className="text-nasun-nw4 mt-6 italic">{t("riskLevel.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 4: What's Live Now ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("liveNow.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.05">
            <div className="mt-2 md:mt-4 lg:mt-6 mb-6">
              <video
                src={padoUiVideo}
                autoPlay
                loop
                muted
                playsInline
                controls
                poster="/images/posters/Pado-Ui-Full-rf28.webp"
                className="w-full rounded-lg"
              />
            </div>
          </FadeInUp>

          {/* Devnet - Live */}
          <FadeInUp delay="0.1">
            <h6 className="text-nasun-nw4 font-medium mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {t("liveNow.devnet.label")}
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {devnetItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.15 + i * 0.03}`}>
                <div className="bg-nasun-nw4/5 border border-nasun-nw4/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-nasun-nw4 shrink-0" />
                    {item}
                  </p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Testnet - Coming */}
          <FadeInUp delay="0.3">
            <h6 className="text-nasun-nw2 font-medium mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("liveNow.testnet.label")}
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {testnetItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.35 + i * 0.03}`}>
                <div className="bg-nasun-nw2/5 border border-nasun-nw2/20 rounded-lg p-4 h-full">
                  <p className="font-medium flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-nasun-nw2 shrink-0" />
                    {item}
                  </p>
                </div>
              </FadeInUp>
            ))}
          </div>

          <FadeInUp delay="0.5">
            <p className="text-nasun-white/60 italic">{t("liveNow.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 5: Early Access ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("earlyAccess.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1">
            <OuterBox color="nw1" padding="md">
              <p className="leading-relaxed mb-6">{t("earlyAccess.intro")}</p>

              <h6 className="text-nasun-nw4 font-semibold mb-2">
                {t("earlyAccess.whatYouGetLabel")}
              </h6>
              <ul className="space-y-2 mb-6">
                {whatYouGet.map((item, i) => (
                  <li key={i} className="text-nasun-white/70 flex gap-2">
                    <span className="text-nasun-nw4 mt-0.5 shrink-0">•</span>
                    {item}
                  </li>
                ))}
              </ul>

              <h6 className="text-nasun-nw4 font-semibold mb-1">
                {t("earlyAccess.prioritizingLabel")}
              </h6>
              <p className="text-nasun-white/70 mb-8">{t("earlyAccess.prioritizing")}</p>

              <div className="flex flex-wrap gap-3 justify-center">
                <Button variant="white" size="lg" asChild>
                  <a
                    href={import.meta.env.VITE_PADO_ALPHA_URL || "https://staging.pado.finance"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("earlyAccess.ctaPrimary")}
                    <ArrowUpRight className="w-4 h-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outlineNw2" size="lg" asChild>
                  <Link to="/pado-revised">
                    {t("earlyAccess.ctaSecondary")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ===== Footer Badge ===== */}
        <section>
          <FadeInUp>
            <p className="text-nasun-nw4/60 text-center">{t("footer.badge")}</p>
          </FadeInUp>
        </section>
      </div>
    </SectionLayout>
  );
};

export default UnifiedOnchain;
