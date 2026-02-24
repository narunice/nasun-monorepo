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
  Users,
  Target,
  DollarSign,
  Shield,
  CheckCircle2,
  Clock,
  Globe,
  Landmark,
  Eye,
  ArrowRightLeft,
  Crosshair,
  Trophy,
  Mail,
  Sparkles,
  Package,
  Server,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const sectionTitleClass = "uppercase";

export const FinanceContent = () => {
  const { t } = useTranslation("finance");

  const asArray = <T,>(val: unknown): T[] =>
    Array.isArray(val) ? val : [];

  const problemPoints = asArray<{ title: string; description: string }>(
    t("problem.points", { returnObjects: true })
  );

  const coreFeatures = asArray<{ title: string; description: string }>(
    t("coreInnovation.features", { returnObjects: true })
  );

  const howItWorksFeatures = asArray<{ title: string; description: string }>(
    t("howItWorks.features", { returnObjects: true })
  );

  const koreaItems = asArray<{ label: string; description: string }>(
    t("koreaMarket.items", { returnObjects: true })
  );

  const flywheelItems = asArray<{ from: string; description: string }>(
    t("flywheel.items", { returnObjects: true })
  );

  const liveItems = asArray<{ title: string; description: string }>(
    t("launchStatus.live", { returnObjects: true })
  );

  const deployedItems = asArray<{ title: string; description: string }>(
    t("launchStatus.deployed", { returnObjects: true })
  );

  const comingItems = asArray<{ title: string; description: string }>(
    t("launchStatus.coming", { returnObjects: true })
  );

  const problemIcons = [Wallet, Layers, Zap, MessageCircle];
  const coreIcons = [ShieldCheck, Lock, DollarSign];
  const howItWorksIcons = [Layers, Shield, Server, Users];
  const koreaIcons = [Globe, Landmark, Eye];
  const flywheelIcons = [ArrowRightLeft, ArrowRightLeft, ArrowRightLeft];

  return (
    <SectionLayout className="!pt-0 !max-w-6xl">
      <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
        {/* ===== Section 1: Why Pado Exists ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("problem.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-lg md:text-xl mb-4">{t("problem.intro")}</p>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {problemPoints.map((point, i) => {
              const Icon = problemIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
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
          <FadeInUp delay="0.4s">
            <p className="text-nasun-white/60 text-base md:text-lg mt-4 leading-relaxed">
              {t("problem.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ===== Section 2: Core Innovation ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("coreInnovation.title")}
            </SectionTitle>
            <p className="text-nasun-white/60 text-lg md:text-xl -mt-2 mb-2">
              {t("coreInnovation.subtitle")}
            </p>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-base md:text-lg mb-4">
              {t("coreInnovation.intro")}
            </p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {coreFeatures.map((feat, i) => {
              const Icon = coreIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <OuterBox color="c1" padding="md" className="!bg-black/30">
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
          <FadeInUp delay="0.35s">
            <p className="text-nasun-white/70 text-base md:text-lg mt-4 italic">
              {t("coreInnovation.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ===== Section 3: How It Works ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("howItWorks.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {howItWorksFeatures.map((feat, i) => {
              const Icon = howItWorksIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.1 + i * 0.05}s`}>
                  <DividerBox
                    color="w4"
                    hideDivider
                    padding="sm"
                    title={feat.title}
                    icon={<Icon className="w-5 h-5 text-nasun-c1" />}
                    className="h-full"
                  >
                    <p className="text-sm md:text-base">{feat.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 4: Products ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("products.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(["trading", "prediction", "lottery", "lending", "payments", "social"] as const).map(
              (key, i) => {
                const icons = [BarChart3, Target, Ticket, Banknote, CreditCard, Users];
                const Icon = icons[i];
                const product = t(`products.${key}`, { returnObjects: true }) as {
                  title: string;
                  status: string;
                  features: string[];
                };
                const statusLower = product.status.toLowerCase();
                const isLive = statusLower.includes("live");
                const isDeployed = statusLower.includes("deployed");
                return (
                  <FadeInUp key={key} delay={`${0.1 + i * 0.05}s`}>
                    <DividerBox color="w4" hideDivider padding="sm" className="h-full relative">
                      <span
                        className={`absolute top-5 right-5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          isLive
                            ? "bg-emerald-500/20 text-emerald-400"
                            : isDeployed
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-amber-500/20 text-amber-400"
                        }`}
                      >
                        {product.status}
                      </span>
                      <div className="flex items-center gap-2 mb-3 pr-24">
                        <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                        <p className="text-nasun-white font-medium text-lg">{product.title}</p>
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
              },
            )}
          </div>
        </section>

        {/* ===== Section 5: Risk Modes ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("riskModes.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-base md:text-lg mb-4">{t("riskModes.intro")}</p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {(
              t("riskModes.modes", { returnObjects: true }) as Array<{
                title: string;
                label: string;
                status: string;
                features: string[];
              }>
            ).map((mode, i) => {
              const modeIcons = [Lock, Crown, Building2];
              const Icon = modeIcons[i];
              const isLive = mode.status === "Live";
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <DividerBox color="w4" hideDivider padding="sm" className="relative">
                    <span
                      className={`absolute top-5 right-5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        isLive
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {mode.status}
                    </span>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                      <p className="text-nasun-white font-medium text-lg">{mode.title}</p>
                      <span className="text-xs text-nasun-white/40">({mode.label})</span>
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
          <FadeInUp delay="0.35s">
            <p className="text-nasun-white/70 text-base mt-4">{t("riskModes.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 6: Contextual Finance ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("contextualFinance.title")}
            </SectionTitle>
            <p className="text-nasun-white/60 text-lg md:text-xl -mt-2 mb-2">
              {t("contextualFinance.subtitle")}
            </p>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-base md:text-lg mb-4">
              {t("contextualFinance.intro")}
            </p>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <OuterBox color="c1" padding="md" className="!bg-black/30 mb-4">
              <p className="text-nasun-white/80 text-base md:text-lg">
                {t("contextualFinance.inversion")}
              </p>
              <p className="text-nasun-c1 text-sm md:text-base mt-3 italic">
                {t("contextualFinance.designPrinciple")}
              </p>
            </OuterBox>
          </FadeInUp>

          <FadeInUp delay="0.2s">
            <p className="text-nasun-white font-medium text-xl md:text-2xl mb-4">
              {t("contextualFinance.sectionTitle")}
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(
              t("contextualFinance.features", { returnObjects: true }) as Array<{
                title: string;
                description: string;
                status: string;
                bullets?: string[];
              }>
            ).map((feat, i) => {
              const contextIcons = [Crosshair, Trophy, Mail, Sparkles];
              const Icon = contextIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.25 + i * 0.05}s`}>
                  <DividerBox color="w4" hideDivider padding="sm" className="h-full relative">
                    <span className="absolute top-5 right-5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-blue-500/20 text-blue-400">
                      {feat.status}
                    </span>
                    <div className="flex items-center gap-2 mb-2 pr-24">
                      <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                      <p className="text-nasun-white font-medium">{feat.title}</p>
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

          <FadeInUp delay="0.5s">
            <p className="text-emerald-400/80 text-sm md:text-base mt-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {t("contextualFinance.liveNow")}
            </p>
          </FadeInUp>
          <FadeInUp delay="0.55s">
            <p className="text-nasun-white/70 text-base mt-4">
              {t("contextualFinance.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ===== Section 7: Korea Market Entry ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("koreaMarket.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">
              {t("koreaMarket.intro")}
            </p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {koreaItems.map((item, i) => {
              const Icon = koreaIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <DividerBox color="w5" padding="sm">
                    <div className="flex gap-3">
                      <Icon className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-nasun-white font-medium">{item.label}</p>
                        <p className="text-sm md:text-base mt-1">{item.description}</p>
                      </div>
                    </div>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 7: Three Verticals, One Flywheel ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("flywheel.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">{t("flywheel.intro")}</p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {flywheelItems.map((item, i) => {
              const Icon = flywheelIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <OuterBox color="c1" padding="md">
                    <div className="flex gap-4">
                      <Icon className="w-6 h-6 text-nasun-c1 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-nasun-white font-medium text-base md:text-lg">
                          {item.from}
                        </p>
                        <p className="text-nasun-white/70 text-sm md:text-base mt-1">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </OuterBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay="0.35s">
            <p className="text-nasun-white/70 text-base md:text-lg mt-6 italic">
              {t("flywheel.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ===== Section 8: Launch Status ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("launchStatus.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.05s">
            <div className="mt-2 md:mt-4 lg:mt-6 mb-6">
              <video
                src="/videos/Pado-Ui-Full-rf16.mp4"
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full rounded-lg"
              />
            </div>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="text-nasun-white/70 text-base md:text-lg mb-8">
              {t("launchStatus.intro")}
            </p>
          </FadeInUp>

          {/* Live Now */}
          <FadeInUp delay="0.15s">
            <p className="text-emerald-400 font-medium text-lg mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Live Now
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {liveItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.2 + i * 0.03}s`}>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium text-sm md:text-base">{item.title}</p>
                  <p className="text-nasun-white/60 text-xs md:text-sm mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Deployed on Devnet */}
          <FadeInUp delay="0.35s">
            <p className="text-blue-400 font-medium text-lg mb-4 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Deployed on Devnet
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {deployedItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.4 + i * 0.03}s`}>
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium text-sm md:text-base">{item.title}</p>
                  <p className="text-nasun-white/60 text-xs md:text-sm mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Coming Next */}
          <FadeInUp delay="0.5s">
            <p className="text-amber-400 font-medium text-lg mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Coming Next
            </p>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {comingItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.55 + i * 0.03}s`}>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4 h-full">
                  <p className="text-nasun-white font-medium text-sm md:text-base">{item.title}</p>
                  <p className="text-nasun-white/60 text-xs md:text-sm mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ===== Section 9: CTA ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" className={sectionTitleClass}>
              {t("cta.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
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
                <Button variant="c1" size="lg" className="text-nasun-black" asChild>
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
                  <Link to="/pado">
                    {t("cta.secondary")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* Footer badge */}
        <FadeInUp>
          <p className="text-nasun-white/40 text-sm text-center">{t("footer.badge")}</p>
        </FadeInUp>
      </div>
    </SectionLayout>
  );
};

export default FinanceContent;
