import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import {
  ExternalLink,
  ArrowRight,
  Box,
  Zap,
  Shield,
  Key,
  Lock,
  Clock,
  BarChart3,
  Target,
  Ticket,
  Activity,
  Layers,
  AlertTriangle,
  TrendingUp,
  Server,
  Code,
  Database,
  Globe,
  CheckCircle,
  Circle,
  MessageCircle,
  Hash,
  Trophy,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const chainIcons = [Box, Zap, Shield, Code];
const socialIcons = { chat: MessageCircle, rooms: Hash, leaderboard: Trophy, auth: Key };
const accountIcons = [Key, Lock, Clock, Shield];
const marketIcons = { deepbook: BarChart3, prediction: Target, lottery: Ticket, oracle: Activity };

export const PadoTechContent = () => {
  const { t } = useTranslation("pado-tech");

  return (
    <SectionLayout className="!pt-0 !max-w-5xl">
      <div className="flex flex-col gap-16 md:gap-24 lg:gap-32">
        {/* ========== SECTION 1: WHY A NEW CHAIN ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("chain.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("chain.intro")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(t("chain.features", { returnObjects: true }) as Array<{ title: string; description: string }>).map(
              (feature, index) => {
                const Icon = chainIcons[index];
                return (
                  <FadeInUp key={index} delay={`${0.2 + index * 0.05}s`}>
                    <DividerBox color="w5" hideDivider={true} padding="sm" className="h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                        <p className="text-nasun-white font-medium">{feature.title}</p>
                      </div>
                      <p className="text-sm text-nasun-white/60 leading-relaxed">
                        {feature.description}
                      </p>
                    </DividerBox>
                  </FadeInUp>
                );
              },
            )}
          </div>
        </section>

        {/* ========== SECTION 2: SOCIAL INFRASTRUCTURE ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("social.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("social.intro")}
            </p>
          </FadeInUp>

          <div className="flex flex-col gap-8">
            {(["chat", "rooms", "leaderboard", "auth"] as const).map((key, index) => {
              const Icon = socialIcons[key];
              const item = t(`social.${key}`, { returnObjects: true }) as {
                title: string;
                description: string;
                specs: string[];
              };
              return (
                <FadeInUp key={key} delay={`${0.2 + index * 0.05}s`}>
                  <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-6 h-6 text-nasun-c1 shrink-0" />
                      <h4 className="text-lg md:text-xl font-medium text-nasun-white">
                        {item.title}
                      </h4>
                    </div>
                    <p className="text-sm md:text-base text-nasun-white/70 leading-relaxed mb-4">
                      {item.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.specs.map((spec, i) => (
                        <span
                          key={i}
                          className="text-xs px-3 py-1 rounded-full bg-nasun-c1/10 text-nasun-c1 border border-nasun-c1/20"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </OuterBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ========== SECTION 3: SMART ACCOUNT ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("account.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("account.intro")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(t("account.features", { returnObjects: true }) as Array<{ title: string; description: string }>).map(
              (feature, index) => {
                const Icon = accountIcons[index];
                return (
                  <FadeInUp key={index} delay={`${0.2 + index * 0.05}s`}>
                    <DividerBox color="w4" hideDivider={true} padding="sm" className="h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                        <p className="text-nasun-white font-medium">{feature.title}</p>
                      </div>
                      <p className="text-sm text-nasun-white/60 leading-relaxed">
                        {feature.description}
                      </p>
                    </DividerBox>
                  </FadeInUp>
                );
              },
            )}
          </div>
        </section>

        {/* ========== SECTION 4: MARKET INFRASTRUCTURE ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("markets.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("markets.intro")}
            </p>
          </FadeInUp>

          <div className="flex flex-col gap-8">
            {(["deepbook", "prediction", "lottery", "oracle"] as const).map((key, index) => {
              const Icon = marketIcons[key];
              const market = t(`markets.${key}`, { returnObjects: true }) as {
                title: string;
                description: string;
                specs: string[];
              };
              return (
                <FadeInUp key={key} delay={`${0.2 + index * 0.05}s`}>
                  <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-6 h-6 text-nasun-c1 shrink-0" />
                      <h4 className="text-lg md:text-xl font-medium text-nasun-white">
                        {market.title}
                      </h4>
                    </div>
                    <p className="text-sm md:text-base text-nasun-white/70 leading-relaxed mb-4">
                      {market.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {market.specs.map((spec, i) => (
                        <span
                          key={i}
                          className="text-xs px-3 py-1 rounded-full bg-nasun-c1/10 text-nasun-c1 border border-nasun-c1/20"
                        >
                          {spec}
                        </span>
                      ))}
                    </div>
                  </OuterBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ========== SECTION 5: CAPITAL INFRASTRUCTURE ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("margin.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("margin.intro")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Collateral */}
            <FadeInUp delay="0.2s">
              <DividerBox color="w4" hideDivider={true} padding="sm" title={t("margin.collateral.title")} icon={<Layers className="w-5 h-5 text-nasun-c1" />} className="h-full">
                <ul className="space-y-2">
                  {(t("margin.collateral.items", { returnObjects: true }) as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-nasun-white/70">
                      <ArrowRight className="w-4 h-4 text-nasun-c1 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </DividerBox>
            </FadeInUp>

            {/* Thresholds */}
            <FadeInUp delay="0.25s">
              <DividerBox color="w4" hideDivider={true} padding="sm" title={t("margin.thresholds.title")} icon={<AlertTriangle className="w-5 h-5 text-nasun-c1" />} className="h-full">
                <div className="space-y-3">
                  {(t("margin.thresholds.items", { returnObjects: true }) as Array<{ label: string; value: string; description: string }>).map((item, i) => (
                    <div key={i} className="flex items-baseline gap-3">
                      <span className="text-nasun-c1 font-mono font-bold text-lg min-w-[3rem]">{item.value}</span>
                      <div>
                        <span className="text-sm text-nasun-white font-medium">{item.label}</span>
                        <span className="text-xs text-nasun-white/50 ml-2">{item.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </DividerBox>
            </FadeInUp>

            {/* Liquidation */}
            <FadeInUp delay="0.3s">
              <DividerBox color="w4" hideDivider={true} padding="sm" title={t("margin.liquidation.title")} icon={<Shield className="w-5 h-5 text-nasun-c1" />} className="h-full">
                <ul className="space-y-2">
                  {(t("margin.liquidation.items", { returnObjects: true }) as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-nasun-white/70">
                      <ArrowRight className="w-4 h-4 text-nasun-c1 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </DividerBox>
            </FadeInUp>

            {/* Perp */}
            <FadeInUp delay="0.35s">
              <DividerBox color="w4" hideDivider={true} padding="sm" title={t("margin.perp.title")} icon={<TrendingUp className="w-5 h-5 text-nasun-c1" />} className="h-full">
                <ul className="space-y-2">
                  {(t("margin.perp.items", { returnObjects: true }) as string[]).map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm text-nasun-white/70">
                      <ArrowRight className="w-4 h-4 text-nasun-c1 shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </DividerBox>
            </FadeInUp>
          </div>
        </section>

        {/* ========== SECTION 6: TECH STACK ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("stack.title")}
            </SectionTitle>
          </FadeInUp>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Frontend */}
            <FadeInUp delay="0.15s">
              <DividerBox color="w5" hideDivider={true} padding="sm" title={t("stack.frontend.title")} icon={<Code className="w-5 h-5 text-nasun-c1" />}>
                <div className="flex flex-wrap gap-2">
                  {(t("stack.frontend.items", { returnObjects: true }) as string[]).map((item, i) => (
                    <span key={i} className="text-xs px-3 py-1 rounded-full bg-nasun-white/5 text-nasun-white/70 border border-nasun-white/10">
                      {item}
                    </span>
                  ))}
                </div>
              </DividerBox>
            </FadeInUp>

            {/* Backend */}
            <FadeInUp delay="0.2s">
              <DividerBox color="w5" hideDivider={true} padding="sm" title={t("stack.backend.title")} icon={<Server className="w-5 h-5 text-nasun-c1" />}>
                <div className="flex flex-wrap gap-2">
                  {(t("stack.backend.items", { returnObjects: true }) as string[]).map((item, i) => (
                    <span key={i} className="text-xs px-3 py-1 rounded-full bg-nasun-white/5 text-nasun-white/70 border border-nasun-white/10">
                      {item}
                    </span>
                  ))}
                </div>
              </DividerBox>
            </FadeInUp>
          </div>

          {/* Contracts Table */}
          <FadeInUp delay="0.25s">
            <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
              <div className="flex items-center gap-3 mb-4">
                <Database className="w-5 h-5 text-nasun-c1" />
                <h4 className="text-lg font-medium text-nasun-white">{t("stack.contracts.title")}</h4>
              </div>
              <div className="space-y-2">
                {(t("stack.contracts.items", { returnObjects: true }) as Array<{ name: string; status: string }>).map((contract, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-nasun-white/5 last:border-0">
                    <span className="text-sm text-nasun-white/80">{contract.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1.5 ${
                      contract.status === "Live"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-yellow-500/10 text-yellow-400"
                    }`}>
                      {contract.status === "Live"
                        ? <CheckCircle className="w-3 h-3" />
                        : <Circle className="w-3 h-3" />
                      }
                      {contract.status}
                    </span>
                  </div>
                ))}
              </div>
            </OuterBox>
          </FadeInUp>

          {/* Network Info */}
          <FadeInUp delay="0.3s">
            <div className="flex flex-wrap gap-3 mt-6">
              <Globe className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
              {(t("stack.network.items", { returnObjects: true }) as string[]).map((item, i) => (
                <span key={i} className="text-xs px-3 py-1 rounded-full bg-nasun-c1/10 text-nasun-c1 font-mono">
                  {item}
                </span>
              ))}
            </div>
          </FadeInUp>
        </section>

        {/* ========== SECTION 7: CTA ========== */}
        <section className="text-center py-8 md:py-12">
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("cta.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg text-nasun-white/70 mb-8 max-w-2xl mx-auto">
              {t("cta.body")}
            </p>
          </FadeInUp>
          <FadeInUp delay="0.2s">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button variant="c1" size="lg" className="text-nasun-black" asChild>
                <a href={import.meta.env.VITE_PADO_ALPHA_URL} target="_blank" rel="noopener noreferrer">
                  {t("cta.primary")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
              <Button variant="outlineC1" size="lg" asChild>
                <Link to="/ecosystem/finance">
                  {t("cta.secondary")}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </FadeInUp>
        </section>
      </div>
    </SectionLayout>
  );
};

export default PadoTechContent;
