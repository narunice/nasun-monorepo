import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import {
  ExternalLink,
  ArrowRight,
  MessageCircle,
  Trophy,
  BarChart3,
  Target,
  Ticket,
  Fingerprint,
  Ban,
  RefreshCw,
  Route,
  Layers,
  Brain,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const thesisKeys = ["socialFiFailed", "inversion", "financeFirstSocial", "visitorJourney", "oneApp"] as const;
const thesisIcons = [Ban, RefreshCw, MessageCircle, Route, Layers];

const featureIcons = [MessageCircle, Trophy, BarChart3, Target, Ticket, Fingerprint];

const phaseConfig = [
  { key: "phase1", accent: "text-nasun-c1", border: "border-nasun-c1/30", icon: Users },
  { key: "phase2", accent: "text-nasun-c4", border: "border-nasun-c4/30", icon: Layers },
  { key: "phase3", accent: "text-nasun-c5", border: "border-nasun-c5/30", icon: Brain },
] as const;

export const PadoVisionContent = () => {
  const { t } = useTranslation("pado-vision");

  return (
    <SectionLayout className="!pt-0 !max-w-5xl">
      <div className="flex flex-col gap-16 md:gap-24 lg:gap-32">
        {/* ========== SECTION 1: THE PROBLEM ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("problem.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="space-y-6 md:space-y-8 text-base md:text-lg leading-relaxed text-nasun-white/70">
            <FadeInUp delay="0.15s">
              <p>{t("problem.p1")}</p>
            </FadeInUp>
            <FadeInUp delay="0.2s">
              <p className="text-nasun-white/50 text-lg md:text-xl font-light">
                {t("problem.p2")}
              </p>
            </FadeInUp>
            <FadeInUp delay="0.25s">
              <p>{t("problem.p3")}</p>
            </FadeInUp>
            <FadeInUp delay="0.3s">
              <p>{t("problem.p4")}</p>
            </FadeInUp>
            <FadeInUp delay="0.35s">
              <p className="text-nasun-c1 font-medium text-lg md:text-xl pt-4">
                {t("problem.closing")}
              </p>
            </FadeInUp>
          </div>
        </section>

        {/* ========== SECTION 2: THESIS ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("thesis.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg leading-relaxed text-nasun-white/70 mb-8 md:mb-12">
              {t("thesis.intro")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {thesisKeys.map((key, index) => {
              const Icon = thesisIcons[index];
              return (
                <FadeInUp key={key} delay={`${0.2 + index * 0.05}s`}>
                  <DividerBox
                    color="w4"
                    hideDivider={true}
                    padding="sm"
                    title={t(`thesis.${key}.title`)}
                    icon={<Icon className="w-5 h-5 text-nasun-c1" />}
                    className={`h-full ${index === thesisKeys.length - 1 ? "lg:col-span-2" : ""}`}
                  >
                    <p className="text-sm md:text-base text-nasun-white/70 leading-relaxed">
                      {t(`thesis.${key}.content`)}
                    </p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ========== SECTION 3: PROOF ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("proof.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg text-nasun-white/70 mb-8 md:mb-12">
              {t("proof.subtitle")}
            </p>
          </FadeInUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {(t("proof.features", { returnObjects: true }) as Array<{ title: string; description: string }>).map(
              (feature, index) => {
                const Icon = featureIcons[index];
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

          <FadeInUp delay="0.5s">
            <OuterBox color="c1" padding="md" className="mt-8 md:mt-12">
              <p className="text-nasun-white font-medium text-center text-lg md:text-xl tracking-wide">
                {t("proof.statLine")}
              </p>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ========== SECTION 4: BLUEPRINT ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("blueprint.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <p className="text-base md:text-lg text-nasun-white/70 mb-8 md:mb-12">
              {t("blueprint.intro")}
            </p>
          </FadeInUp>

          <div className="flex flex-col gap-6 md:gap-8">
            {phaseConfig.map(({ key, accent, border, icon: PhaseIcon }, phaseIndex) => {
              const phase = t(`blueprint.${key}`, { returnObjects: true }) as {
                title: string;
                items: Array<{ title: string; description: string }>;
              };
              return (
                <FadeInUp key={key} delay={`${0.2 + phaseIndex * 0.1}s`}>
                  <div className={`border-l-2 ${border} pl-6 md:pl-8`}>
                    <div className="flex items-center gap-3 mb-4">
                      <PhaseIcon className={`w-6 h-6 ${accent} shrink-0`} />
                      <h4 className={`text-xl md:text-2xl font-medium ${accent}`}>
                        {phase.title}
                      </h4>
                    </div>
                    <div className="space-y-4">
                      {phase.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex gap-3">
                          <ArrowRight
                            className={`w-4 h-4 ${accent} shrink-0 mt-1.5 opacity-50`}
                          />
                          <div>
                            <p className="text-nasun-white font-medium">{item.title}</p>
                            <p className="text-sm text-nasun-white/60 leading-relaxed mt-1">
                              {item.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </FadeInUp>
              );
            })}
          </div>

          <FadeInUp delay="0.5s">
            <p className="text-nasun-c1 font-medium text-lg md:text-xl mt-8 md:mt-12 italic">
              {t("blueprint.closing")}
            </p>
          </FadeInUp>
        </section>

        {/* ========== SECTION 5: COMMUNITY IS THE PRODUCT ========== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h3" className="!text-3xl md:!text-4xl lg:!text-5xl !leading-tight">
              {t("community.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.15s">
            <OuterBox color="w1" padding="md" className="!bg-[#2a2a2a]">
              <p className="text-base md:text-lg text-nasun-white/70 leading-relaxed">
                {t("community.content")}
              </p>
            </OuterBox>
          </FadeInUp>
        </section>

        {/* ========== SECTION 6: CTA ========== */}
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
                <a
                  href={import.meta.env.VITE_PADO_ALPHA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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

export default PadoVisionContent;
