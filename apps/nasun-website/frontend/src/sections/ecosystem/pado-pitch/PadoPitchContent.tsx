import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import {
  ExternalLink,
  ArrowRight,
  TrendingUp,
  Globe,
  Target,
  Layers,
  Package,
  Users,
  Shield,
  DollarSign,
  BarChart3,
  Ticket,
  Brain,
  ShoppingCart,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const marketIcons = [TrendingUp, Globe, Target, Layers];
const productIcons = [Users, Package, Shield, Layers];
const businessIcons = [DollarSign, BarChart3, Ticket, Brain, ShoppingCart];

export const PadoPitchContent = () => {
  const { t } = useTranslation("pado-pitch");

  return (
    <SectionLayout className="!pt-0 !max-w-5xl">
      <div className="flex flex-col gap-16 md:gap-24 lg:gap-32">
        {/* ========== SECTION 1: THE MARKET ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("market.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("market.intro")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(t("market.points", { returnObjects: true }) as Array<{ title: string; description: string }>).map(
              (point, index) => {
                const Icon = marketIcons[index];
                return (
                  <FadeInUp key={index} delay={`${0.2 + index * 0.05}s`}>
                    <DividerBox color="w5" hideDivider={true} padding="sm" className="h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                        <p className="text-nasun-white font-medium">{point.title}</p>
                      </div>
                      <p className="text-sm text-nasun-white/60 leading-relaxed">
                        {point.description}
                      </p>
                    </DividerBox>
                  </FadeInUp>
                );
              },
            )}
          </div>
        </section>

        {/* ========== SECTION 2: THE PRODUCT ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("product.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("product.intro")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(t("product.highlights", { returnObjects: true }) as Array<{ title: string; description: string }>).map(
              (item, index) => {
                const Icon = productIcons[index];
                return (
                  <FadeInUp key={index} delay={`${0.2 + index * 0.05}s`}>
                    <DividerBox color="w4" hideDivider={true} padding="sm" className="h-full">
                      <div className="flex items-center gap-3 mb-3">
                        <Icon className="w-5 h-5 text-nasun-c1 shrink-0" />
                        <p className="text-nasun-white font-medium">{item.title}</p>
                      </div>
                      <p className="text-sm text-nasun-white/60 leading-relaxed">
                        {item.description}
                      </p>
                    </DividerBox>
                  </FadeInUp>
                );
              },
            )}
          </div>
        </section>

        {/* ========== SECTION 3: TRACTION ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("traction.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-lg md:text-xl font-light text-nasun-white/70 mb-8 md:mb-12 italic">
              {t("traction.intro")}
            </p>
          </FadeInUp>

          {/* Key Metrics */}
          <FadeInUp delay="0.2s">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {(t("traction.metrics", { returnObjects: true }) as Array<{ label: string; value: string; detail: string }>).map(
                (metric, index) => (
                  <OuterBox key={index} color="c1" padding="sm">
                    <p className="text-3xl md:text-4xl font-bold text-nasun-c1 mb-1">{metric.value}</p>
                    <p className="text-sm font-medium text-nasun-white">{metric.label}</p>
                    <p className="text-xs text-nasun-white/50 mt-1">{metric.detail}</p>
                  </OuterBox>
                ),
              )}
            </div>
          </FadeInUp>

          {/* Deployed List */}
          <FadeInUp delay="0.3s">
            <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
              <div className="space-y-3">
                {(t("traction.deployed", { returnObjects: true }) as string[]).map((item, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-nasun-white/80">{item}</span>
                  </div>
                ))}
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ========== SECTION 4: BUSINESS MODEL ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("business.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("business.intro")}
            </p>
          </FadeInUp>

          <div className="flex flex-col gap-4">
            {(t("business.streams", { returnObjects: true }) as Array<{ title: string; description: string }>).map(
              (stream, index) => {
                const Icon = businessIcons[index];
                return (
                  <FadeInUp key={index} delay={`${0.2 + index * 0.05}s`}>
                    <div className="flex gap-4 items-start p-4 rounded-lg bg-nasun-white/[0.02] border border-nasun-white/5">
                      <Icon className="w-5 h-5 text-nasun-c1 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-nasun-white font-medium mb-1">{stream.title}</p>
                        <p className="text-sm text-nasun-white/60 leading-relaxed">
                          {stream.description}
                        </p>
                      </div>
                    </div>
                  </FadeInUp>
                );
              },
            )}
          </div>
        </section>

        {/* ========== SECTION 5: ROADMAP ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("roadmap.title")}
            </SectionTitle>
          </FadeInUp>

          <div className="flex flex-col gap-6 md:gap-8">
            {(t("roadmap.phases", { returnObjects: true }) as Array<{ title: string; subtitle: string; items: string[] }>).map(
              (phase, phaseIndex) => {
                const accents = ["text-nasun-c1 border-nasun-c1/30", "text-nasun-c4 border-nasun-c4/30", "text-nasun-c5 border-nasun-c5/30"];
                const accent = accents[phaseIndex];
                return (
                  <FadeInUp key={phaseIndex} delay={`${0.2 + phaseIndex * 0.1}s`}>
                    <div className={`border-l-2 ${accent.split(" ")[1]} pl-6 md:pl-8`}>
                      <div className="flex items-center gap-3 mb-1">
                        <Calendar className={`w-5 h-5 ${accent.split(" ")[0]} shrink-0`} />
                        <h4 className={`text-xl md:text-2xl font-medium ${accent.split(" ")[0]}`}>
                          {phase.title}
                        </h4>
                      </div>
                      <p className="text-sm text-nasun-white/50 mb-4 ml-8">{phase.subtitle}</p>
                      <div className="space-y-2 ml-8">
                        {phase.items.map((item, i) => (
                          <div key={i} className="flex gap-2 text-sm text-nasun-white/70">
                            <ArrowRight className={`w-4 h-4 ${accent.split(" ")[0]} shrink-0 mt-0.5 opacity-50`} />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </FadeInUp>
                );
              },
            )}
          </div>

          <FadeInUp delay="0.5s">
            <OuterBox color="c1" padding="md" className="mt-8 md:mt-12">
              <p className="text-nasun-white font-medium text-center text-lg md:text-xl tracking-wide">
                {t("roadmap.sequence")}
              </p>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ========== SECTION 6: THE ASK ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("ask.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("ask.intro")}
            </p>
          </FadeInUp>

          <div className="flex flex-col gap-6 mb-12">
            {(t("ask.details", { returnObjects: true }) as Array<{ title: string; content: string }>).map(
              (detail, index) => (
                <FadeInUp key={index} delay={`${0.2 + index * 0.05}s`}>
                  <div className="border-l-2 border-nasun-c1/30 pl-6">
                    <p className="text-nasun-c1 font-medium text-sm uppercase tracking-wider mb-2">
                      {detail.title}
                    </p>
                    <p className="text-nasun-white/80 leading-relaxed">{detail.content}</p>
                  </div>
                </FadeInUp>
              ),
            )}
          </div>

          <FadeInUp delay="0.35s">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
              <Button variant="c1" size="lg" className="text-nasun-black" asChild>
                <a href={import.meta.env.VITE_PADO_ALPHA_URL} target="_blank" rel="noopener noreferrer">
                  {t("ask.cta.secondary")}
                  <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
              <Button variant="outlineC1" size="lg" asChild>
                <Link to="/ecosystem/finance">
                  {t("ask.cta.tertiary")}
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

export default PadoPitchContent;
