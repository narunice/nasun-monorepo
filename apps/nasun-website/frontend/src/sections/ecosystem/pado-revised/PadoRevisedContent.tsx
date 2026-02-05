import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import {
  ExternalLink,
  ArrowRight,
  Wallet,
  ShieldCheck,
  Zap,
  Layers,
  BarChart3,
  Banknote,
  CreditCard,
  Ticket,
  Lock,
  Crown,
  Building2,
  MessageCircle,
  Trophy,
  Mail,
  Bot,
  Target,
  Repeat,
  Key,
  DollarSign,
  Shield,
  CheckCircle2,
  Clock,
  Globe,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const sectionTitleClass = "!text-3xl md:!text-4xl lg:!text-5xl !leading-tight";

export const PadoRevisedContent = () => {
  const { t } = useTranslation("pado-revised");

  const problemPoints = t("problem.points", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const coreFeatures = t("coreInnovation.features", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const perfFeatures = t("performance.features", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const contextFeatures = t("contextualFinance.features", { returnObjects: true }) as Array<{
    title: string;
    description: string;
    status: string;
    bullets?: string[];
  }>;

  const intentFeatures = t("intentBased.features", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const bridgeFeatures = t("bridging.features", { returnObjects: true }) as string[];

  const econBullets = t("economic.bullets", { returnObjects: true }) as string[];

  const liveItems = t("launchStatus.live", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const comingItems = t("launchStatus.coming", { returnObjects: true }) as Array<{
    title: string;
    description: string;
  }>;

  const problemIcons = [Wallet, Layers, Zap, MessageCircle];
  const perfIcons = [Zap, Layers, BarChart3];
  const coreIcons = [ShieldCheck, Lock, DollarSign];
  const contextIcons = [Target, Trophy, Mail, Bot];
  const intentIcons = [Globe, Shield, Key];

  return (
    <SectionLayout className="!pt-0 !max-w-5xl">
      <div className="flex flex-col gap-16 md:gap-24 lg:gap-32">
        {/* ===== Section 1: Intro + Value Prop ===== */}
        <section>
          <FadeInUp>
            <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
              <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed">
                {t("intro.body")}
              </p>
              <p className="text-nasun-white/70 text-base md:text-lg leading-relaxed mt-4">
                {t("intro.valueProps")}
              </p>
              <Button
                variant="c1"
                size="lg"
                className="flex w-fit items-center gap-2 mt-6 mx-auto text-nasun-black"
                asChild
              >
                <a
                  href={import.meta.env.VITE_PADO_ALPHA_URL || "https://staging.pado.finance"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("cta.primary")}
                  <ExternalLink className="w-4 h-4 ml-1" />
                </a>
              </Button>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ===== Section 2: Why Pado Exists ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("problem.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-lg md:text-xl mb-8">
              {t("problem.intro")}
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {problemPoints.map((point, i) => {
              const Icon = problemIcons[i];
              return (
                <FadeInUp key={i} delay={0.15 + i * 0.05}>
                  <DividerBox
                    color="w4"
                    hideDivider
                    padding="sm"
                    title={point.title}
                    icon={<Icon className="w-5 h-5 text-nasun-c1" />}
                    className="h-full"
                  >
                    <p className="text-sm md:text-base">{point.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay={0.4}>
            <p className="text-nasun-c1/90 text-base md:text-lg mt-8 leading-relaxed">
              {t("problem.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ===== Section 3: Core Innovation ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("coreInnovation.title")}
            </SectionTitle>
            <p className="text-nasun-white/60 text-lg md:text-xl -mt-2 mb-2">
              {t("coreInnovation.subtitle")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">
              {t("coreInnovation.intro")}
            </p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {coreFeatures.map((feat, i) => {
              const Icon = coreIcons[i];
              return (
                <FadeInUp key={i} delay={0.15 + i * 0.05}>
                  <OuterBox color="c1" padding="md">
                    <div className="flex gap-4">
                      <Icon className="w-6 h-6 text-nasun-c1 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-nasun-white font-medium text-base md:text-lg">
                          {feat.title}
                        </p>
                        <p className="text-nasun-white/70 text-sm md:text-base mt-1">
                          {feat.description}
                        </p>
                      </div>
                    </div>
                  </OuterBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay={0.35}>
            <p className="text-nasun-white/70 text-base md:text-lg mt-6 italic">
              {t("coreInnovation.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ===== Section 4: Performance at Scale ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("performance.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">
              {t("performance.intro")}
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {perfFeatures.map((feat, i) => {
              const Icon = perfIcons[i];
              return (
                <FadeInUp key={i} delay={0.15 + i * 0.05}>
                  <DividerBox color="w5" padding="sm" className="h-full">
                    <div className="flex gap-3">
                      <Icon className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-nasun-white font-medium">{feat.title}</p>
                        <p className="text-sm md:text-base mt-1">{feat.description}</p>
                      </div>
                    </div>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay={0.4}>
            <p className="text-nasun-white/70 text-base mt-6">{t("performance.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 5: Unified Financial Experience ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("products.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(["trading", "prediction", "lottery", "lending", "payments"] as const).map((key, i) => {
              const icons = [BarChart3, Target, Ticket, Banknote, CreditCard];
              const Icon = icons[i];
              const product = t(`products.${key}`, { returnObjects: true }) as {
                title: string;
                status: string;
                features: string[];
              };
              const isLive = product.status.toLowerCase().includes("live");
              return (
                <FadeInUp key={key} delay={0.1 + i * 0.05}>
                  <DividerBox color="w4" hideDivider padding="sm" className="h-full">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-nasun-c1" />
                        <p className="text-nasun-white font-medium text-lg">{product.title}</p>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isLive
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {product.status}
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {product.features.map((feat, j) => (
                        <li key={j} className="text-sm md:text-base flex gap-2">
                          <span className="text-nasun-c1 mt-1 shrink-0">•</span>
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 6: Risk Modes ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("riskModes.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">
              {t("riskModes.intro")}
            </p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {(t("riskModes.modes", { returnObjects: true }) as Array<{
              title: string;
              label: string;
              status: string;
              features: string[];
            }>).map((mode, i) => {
              const modeIcons = [Lock, Crown, Building2];
              const Icon = modeIcons[i];
              const isLive = mode.status === "Live";
              return (
                <FadeInUp key={i} delay={0.15 + i * 0.05}>
                  <DividerBox color="w4" hideDivider padding="sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-nasun-c1" />
                        <p className="text-nasun-white font-medium text-lg">{mode.title}</p>
                        <span className="text-xs text-nasun-white/40">({mode.label})</span>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isLive
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {mode.status}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {mode.features.map((feat, j) => (
                        <li key={j} className="text-sm md:text-base flex gap-2">
                          <span className="text-nasun-c1 mt-1 shrink-0">•</span>
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay={0.35}>
            <p className="text-nasun-white/70 text-base mt-6">{t("riskModes.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 7: Contextual Finance ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("contextualFinance.title")}
            </SectionTitle>
            <p className="text-nasun-white/60 text-lg md:text-xl -mt-2 mb-2">
              {t("contextualFinance.subtitle")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-4">
              {t("contextualFinance.intro")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.15}>
            <OuterBox color="c1" padding="md" className="mb-6">
              <p className="text-nasun-white/80 text-base md:text-lg">
                {t("contextualFinance.inversion")}
              </p>
              <p className="text-nasun-c1 text-sm md:text-base mt-3 italic">
                {t("contextualFinance.designPrinciple")}
              </p>
            </OuterBox>
          </FadeInUp>

          <FadeInUp delay={0.2}>
            <p className="text-nasun-white font-medium text-xl md:text-2xl mb-4">
              {t("contextualFinance.sectionTitle")}
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contextFeatures.map((feat, i) => {
              const Icon = contextIcons[i];
              return (
                <FadeInUp key={i} delay={0.25 + i * 0.05}>
                  <DividerBox color="w4" hideDivider padding="sm" className="h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-nasun-c1" />
                        <p className="text-nasun-white font-medium">{feat.title}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                        {feat.status}
                      </span>
                    </div>
                    <p className="text-sm md:text-base">{feat.description}</p>
                    {feat.bullets && (
                      <ul className="mt-2 space-y-1">
                        {feat.bullets.map((bullet, j) => (
                          <li key={j} className="text-sm flex gap-2 text-nasun-white/70">
                            <span className="text-nasun-c1 mt-0.5 shrink-0">•</span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>

          <FadeInUp delay={0.5}>
            <p className="text-emerald-400/80 text-sm md:text-base mt-6 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {t("contextualFinance.liveNow")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.55}>
            <p className="text-nasun-white/70 text-base mt-4">{t("contextualFinance.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 8: Intent-Based & Agent-Ready ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("intentBased.title")}
            </SectionTitle>
            <p className="text-nasun-white/60 text-lg md:text-xl -mt-2 mb-2">
              {t("intentBased.subtitle")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-4">
              {t("intentBased.intro")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.15}>
            <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a] mb-6">
              <p className="text-nasun-c1 italic text-base md:text-lg">
                {t("intentBased.example")}
              </p>
            </OuterBox>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {intentFeatures.map((feat, i) => {
              const Icon = intentIcons[i];
              return (
                <FadeInUp key={i} delay={0.2 + i * 0.05}>
                  <DividerBox color="w5" padding="sm">
                    <div className="flex gap-3">
                      <Icon className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-nasun-white font-medium">{feat.title}</p>
                        <p className="text-sm md:text-base mt-1">{feat.description}</p>
                      </div>
                    </div>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
          {t("intentBased.closing") && (
            <FadeInUp delay={0.4}>
              <p className="text-nasun-white/70 text-base mt-6 italic">
                {t("intentBased.closing")}
              </p>
            </FadeInUp>
          )}
        </section>

        {/* ===== Section 9: Secure Asset Bridging ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("bridging.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-6">
              {t("bridging.intro")}
            </p>
          </FadeInUp>
          <FadeInUp delay={0.15}>
            <OuterBox color="c1" padding="md">
              <ul className="space-y-3">
                {bridgeFeatures.map((item, i) => (
                  <li key={i} className="flex gap-3 text-nasun-white/80">
                    <Repeat className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
                    <span className="text-sm md:text-base">{item}</span>
                  </li>
                ))}
              </ul>
            </OuterBox>
          </FadeInUp>
          <FadeInUp delay={0.25}>
            <p className="text-nasun-white/70 text-base mt-6">{t("bridging.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 10: Economic Model ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("economic.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <OuterBox color="c1" padding="md">
              <ul className="space-y-3">
                {econBullets.map((bullet, i) => (
                  <li key={i} className="flex gap-3 text-nasun-white/80">
                    <DollarSign className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
                    <span className="text-sm md:text-base">{bullet}</span>
                  </li>
                ))}
              </ul>
            </OuterBox>
          </FadeInUp>
          <FadeInUp delay={0.25}>
            <p className="text-nasun-white/70 text-base mt-6">{t("economic.insurance")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 11: Launch Status ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("launchStatus.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">
              {t("launchStatus.intro")}
            </p>
          </FadeInUp>

          {/* Live Now */}
          <FadeInUp delay={0.15}>
            <p className="text-emerald-400 font-medium text-lg mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Live Now
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {liveItems.map((item, i) => (
              <FadeInUp key={i} delay={0.2 + i * 0.03}>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium text-sm md:text-base">{item.title}</p>
                  <p className="text-nasun-white/60 text-xs md:text-sm mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Coming Next */}
          <FadeInUp delay={0.4}>
            <p className="text-amber-400 font-medium text-lg mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Coming Next
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {comingItems.map((item, i) => (
              <FadeInUp key={i} delay={0.45 + i * 0.03}>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium text-sm md:text-base">{item.title}</p>
                  <p className="text-nasun-white/60 text-xs md:text-sm mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ===== Section 12: CTA ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className={sectionTitleClass}>
              {t("cta.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay={0.1}>
            <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
              <p className="text-nasun-white/80 text-base md:text-lg leading-relaxed">
                {t("cta.body")}
              </p>
              <p className="text-nasun-white font-medium text-xl md:text-2xl mt-6">
                {t("cta.tagline")}
              </p>
              <p className="text-nasun-c1 text-base md:text-lg mt-2">{t("cta.closing")}</p>
              <p className="text-nasun-white/60 text-base md:text-lg mt-1 italic">
                {t("cta.motto")}
              </p>

              <div className="flex flex-wrap gap-3 mt-8 justify-center">
                <Button
                  variant="c1"
                  size="lg"
                  className="text-nasun-black"
                  asChild
                >
                  <a
                    href={import.meta.env.VITE_PADO_ALPHA_URL || "https://staging.pado.finance"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("cta.primary")}
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outlineC1" size="lg" asChild>
                  <Link to="/pado-new">
                    {t("cta.secondary")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outlineC1" size="lg" asChild>
                  <Link to="/pado-new2">
                    {t("cta.tertiary")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* Market Positioning (inline, no separate visual section) */}
        <section>
          <FadeInUp>
            <p className="text-nasun-white/50 text-sm md:text-base leading-relaxed text-center max-w-3xl mx-auto">
              {t("positioning.intro")}
            </p>
            <p className="text-nasun-white/40 text-sm md:text-base leading-relaxed text-center max-w-3xl mx-auto mt-3">
              {t("positioning.closing")}
            </p>
          </FadeInUp>
        </section>
      </div>
    </SectionLayout>
  );
};

export default PadoRevisedContent;
