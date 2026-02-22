import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import {
  ExternalLink,
  Layers,
  Shield,
  Bot,
  Users,
  ShieldCheck,
  Crown,
  Building2,
  CheckCircle2,
  Clock,
  ArrowRight,
  Globe,
  TrendingUp,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import padoUiVideo from "@/assets/videos/Pado-Ui-Full-rf16.mp4";

export const PadoDraftContent = () => {
  // Dynamic namespace — strict key typing not applicable
  const { t, ready } = useTranslation("pado-draft" as "pado") as {
    t: (key: string, options?: Record<string, unknown>) => string;
    ready: boolean;
  };

  const rawFeatures = t("howItWorks.features", { returnObjects: true });
  const howItWorksFeatures = Array.isArray(rawFeatures)
    ? (rawFeatures as Array<{
        title: string;
        description: string;
      }>)
    : [];

  const rawModes = t("riskLevel.modes", { returnObjects: true });
  const riskModes = Array.isArray(rawModes)
    ? (rawModes as Array<{
        title: string;
        label: string;
        description: string;
      }>)
    : [];

  const rawDevnet = t("liveNow.devnet.items", { returnObjects: true });
  const devnetItems = Array.isArray(rawDevnet) ? (rawDevnet as string[]) : [];

  const rawComing = t("liveNow.coming.items", { returnObjects: true });
  const comingItems = Array.isArray(rawComing) ? (rawComing as string[]) : [];

  const rawFlywheel = t("flywheel.items", { returnObjects: true });
  const flywheelItems = Array.isArray(rawFlywheel)
    ? (rawFlywheel as Array<{
        from: string;
        description: string;
      }>)
    : [];

  if (!ready) return null;

  const howItWorksIcons = [Layers, Shield, Bot, Users];
  const howItWorksIconSizes = ["w-5 h-5", "w-6 h-6", "w-6 h-6", "w-5 h-5"];
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

        {/* ===== Section 2: Global Product, Korea-First Entry ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("whyKorea.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1">
            <p className="text-nasun-white/70 mb-4">{t("whyKorea.intro")}</p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            <FadeInUp delay="0.15">
              <DividerBox
                color="nw0"
                hideDivider
                padding="sm"
                title={t("whyKorea.strategyLabel")}
                icon={<ShieldCheck className="w-5 h-5 text-nasun-nw4" />}
                titleClassName="!text-nasun-nw4"
              >
                <p>{t("whyKorea.strategy")}</p>
              </DividerBox>
            </FadeInUp>
            <FadeInUp delay="0.2">
              <DividerBox
                color="nw0"
                hideDivider
                padding="sm"
                title={t("whyKorea.regulatoryLabel")}
                icon={<TrendingUp className="w-5 h-5 text-nasun-nw4" />}
                titleClassName="!text-nasun-nw4"
              >
                <p>{t("whyKorea.regulatory")}</p>
              </DividerBox>
            </FadeInUp>
            <FadeInUp delay="0.25">
              <DividerBox
                color="nw0"
                hideDivider
                padding="sm"
                title={t("whyKorea.visionLabel")}
                icon={<Globe className="w-5 h-5 text-nasun-nw4" />}
                titleClassName="!text-nasun-nw4"
              >
                <p>{t("whyKorea.vision")}</p>
              </DividerBox>
            </FadeInUp>
          </div>
        </section>

        {/* ===== Section 3: How It Works ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("howItWorks.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {howItWorksFeatures.map((feat, i) => {
              const Icon = howItWorksIcons[i];
              const iconSize = howItWorksIconSizes[i];
              return (
                <FadeInUp key={i} delay={`${0.1 + i * 0.05}`}>
                  <DividerBox
                    color="nw1"
                    hideDivider
                    padding="sm"
                    title={feat.title}
                    icon={<Icon className={`${iconSize} text-nasun-nw4`} />}
                    titleClassName="!text-nasun-nw4"
                    className="h-full border-nasun-nw4/30 !bg-[#212E57]/50"
                  >
                    <p>{feat.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 4: Choose Your Risk Level ===== */}
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

        {/* ===== Section 5: What's Live Now ===== */}
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
                className="w-full rounded-lg"
              />
            </div>
          </FadeInUp>

          {/* Devnet - Live */}
          <FadeInUp delay="0.1">
            <h6 className="text-emerald-400 font-medium mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {t("liveNow.devnet.label")}
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {devnetItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.15 + i * 0.03}`}>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    {item}
                  </p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Coming to Testnet */}
          <FadeInUp delay="0.3">
            <h6 className="text-nasun-nw4 font-medium mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              {t("liveNow.coming.label")}
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {comingItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.35 + i * 0.03}`}>
                <div className="bg-nasun-nw4/5 border border-nasun-nw4/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white/70 font-medium flex items-center gap-2">
                    <ArrowRight className="w-4 h-4 text-nasun-nw4 shrink-0" />
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

        {/* ===== Section 6: Three Verticals, One Flywheel ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("flywheel.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1">
            <p className="text-nasun-white/70 mb-4">{t("flywheel.intro")}</p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {flywheelItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.15 + i * 0.05}`}>
                <DividerBox
                  color="nw1"
                  hideDivider
                  padding="sm"
                  title={item.from}
                  icon={<RefreshCw className="w-5 h-5 text-nasun-nw4" />}
                  titleClassName="!text-nasun-nw4"
                  className="h-full border-nasun-nw4/30 !bg-[#212E57]/50"
                >
                  <p>{item.description}</p>
                </DividerBox>
              </FadeInUp>
            ))}
          </div>
          <FadeInUp delay="0.35">
            <p className="text-nasun-nw4 mt-6 italic">{t("flywheel.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 7: Try Pado ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className="uppercase">
              {t("tryPado.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1">
            <OuterBox color="nw1" padding="md">
              <p className="leading-relaxed mb-8 text-center">{t("tryPado.intro")}</p>

              <div className="flex flex-wrap gap-3 justify-center">
                <Button variant="white" size="lg" asChild>
                  <a
                    href={import.meta.env.VITE_PADO_ALPHA_URL || "https://staging.pado.finance"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("tryPado.ctaPrimary")}
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outlineNw2" size="lg" asChild>
                  <a href="/pado-revised" target="_blank" rel="noopener noreferrer">
                    {t("tryPado.ctaSecondary")}
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
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

export default PadoDraftContent;
