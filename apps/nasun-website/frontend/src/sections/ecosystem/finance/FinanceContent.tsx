import { SectionLayout } from "@/components/layout/SectionLayout";
import { DividerBox } from "@/components/ui/DividerBox";
import { OuterBox } from "@/components/ui/OuterBox";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Button } from "@/components/ui/button";
import { FadeInUp } from "@/components/ui/FadeInUp";
import {
  Wallet,
  ShieldCheck,
  Zap,
  Layers,
  BarChart3,
  Banknote,
  Ticket,
  Lock,
  MessageCircle,
  Users,
  Target,
  DollarSign,
  CheckCircle2,
  Clock,
  Globe,
  Landmark,
  Eye,
  Crosshair,
  Trophy,
  Copy,
  Mail,
  Sparkles,
  Package,
  Newspaper,
  Bot,
  Download,
  FileText,
} from "lucide-react";
import { useTranslation } from "react-i18next";


const sectionTitleClass = "uppercase";

export const FinanceContent = () => {
  const { t } = useTranslation("finance");

  const asArray = <T,>(val: unknown): T[] => (Array.isArray(val) ? val : []);

  const problemPoints = asArray<{ title: string; description: string }>(
    t("problem.points", { returnObjects: true }),
  );

  const coreFeatures = asArray<{ title: string; description: string }>(
    t("coreInnovation.features", { returnObjects: true }),
  );

  const howItWorksFeatures = asArray<{ title: string; description: string }>(
    t("howItWorks.features", { returnObjects: true }),
  );

  const koreaItems = asArray<{ label: string; description: string }>(
    t("koreaMarket.items", { returnObjects: true }),
  );

  const liveItems = asArray<{ title: string; description: string }>(
    t("launchStatus.live", { returnObjects: true }),
  );

  const deployedItems = asArray<{ title: string; description: string }>(
    t("launchStatus.deployed", { returnObjects: true }),
  );

  const comingItems = asArray<{ title: string; description: string }>(
    t("launchStatus.coming", { returnObjects: true }),
  );

  const problemIcons = [Wallet, Layers, Zap, MessageCircle];
  const coreIcons = [ShieldCheck, Lock, DollarSign];
  const howItWorksIcons = [Layers, Zap, Bot, Users];
  const koreaIcons = [Globe, Landmark, Eye];

  return (
    <SectionLayout className="!max-w-6xl">
      <div className="flex flex-col gap-10 md:gap-12 lg:gap-14">
        {/* ===== Section 1: Why Pado Exists ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("problem.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <h5 className="mb-4">{t("problem.intro")}</h5>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {problemPoints.map((point, i) => {
              const Icon = problemIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <DividerBox
                    color="pd1"
                    hideDivider
                    padding="sm"
                    title={point.title}
                    icon={<Icon className="w-5 h-5 text-pado-2" />}
                    className="h-full"
                  >
                    <p>{point.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay="0.4s">
            <p className="mt-4">{t("problem.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 2: Core Innovation ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("coreInnovation.title")}
            </SectionTitle>
            <h5 className="-mt-2 mb-2">{t("coreInnovation.subtitle")}</h5>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="mb-4">{t("coreInnovation.intro")}</p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {coreFeatures.map((feat, i) => {
              const Icon = coreIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <OuterBox color="pd1" padding="md" className="!bg-gray-950">
                    <div className="flex gap-4">
                      <Icon className="w-6 h-6 text-pado-2 shrink-0 mt-0.5" />
                      <div>
                        <h6 className="!text-pado-2 font-medium">{feat.title}</h6>
                        <p className="mt-1">{feat.description}</p>
                      </div>
                    </div>
                  </OuterBox>
                </FadeInUp>
              );
            })}
          </div>
          <FadeInUp delay="0.35s">
            <p className="mt-4">{t("coreInnovation.closing")}</p>
          </FadeInUp>
        </section>

        {/* ===== Section 3: How It Works ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("howItWorks.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {howItWorksFeatures.map((feat, i) => {
              const Icon = howItWorksIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.1 + i * 0.05}s`}>
                  <DividerBox
                    color="pd1"
                    hideDivider
                    padding="sm"
                    title={feat.title}
                    icon={<Icon className="w-5 h-5 text-pado-2" />}
                    className="h-full"
                  >
                    <p>{feat.description}</p>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 4: A Unified Financial Experience ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("products.title")}
            </SectionTitle>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(["trading", "perps", "prediction", "lottery", "lending", "social"] as const).map(
              (key, i) => {
                const icons = [BarChart3, Layers, Target, Ticket, Banknote, Users];
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
                    <DividerBox color="pd2" hideDivider padding="sm" className="h-full relative">
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
                        <Icon className="w-5 h-5 text-pado-2 shrink-0" />
                        <h6 className="!text-pd4 font-medium">{product.title}</h6>
                      </div>
                      <div className="space-y-2">
                        {product.features.map((feat, j) => (
                          <p key={j} className="flex gap-2">
                            <span className="text-pado-2 mt-0.5 shrink-0">•</span>
                            {feat}
                          </p>
                        ))}
                      </div>
                    </DividerBox>
                  </FadeInUp>
                );
              },
            )}
          </div>
        </section>

        {/* ===== Section 5: Contextual Finance ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("contextualFinance.title")}
            </SectionTitle>
            <h5 className="-mt-2 mb-2">{t("contextualFinance.subtitle")}</h5>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="mb-4">{t("contextualFinance.intro")}</p>
            <p className="mb-4">{t("contextualFinance.inversion")}</p>
            <p className="text-pado-2 mb-4">{t("contextualFinance.designPrinciple")}</p>
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
              const contextIcons = [MessageCircle, Newspaper, Crosshair, Trophy, Copy, Mail, Sparkles];
              const Icon = contextIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.25 + i * 0.05}s`}>
                  <DividerBox color="pd1" hideDivider padding="sm" className="h-full relative">
                    <span
                      className={`absolute top-5 right-5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                        feat.status.toLowerCase() === "live"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : feat.status.toLowerCase().includes("deployed")
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {feat.status}
                    </span>
                    <div className="flex items-center gap-2 mb-2 pr-24">
                      <Icon className="w-5 h-5 text-pado-2 shrink-0" />
                      <h6 className="text-pd5 font-medium">{feat.title}</h6>
                    </div>
                    <p>{feat.description}</p>
                    {feat.bullets && (
                      <div className="mt-2 space-y-1">
                        {feat.bullets.map((bullet, j) => (
                          <p key={j} className="flex gap-2">
                            <span className="text-pado-2 mt-0.5 shrink-0">•</span>
                            {bullet}
                          </p>
                        ))}
                      </div>
                    )}
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>

        </section>

        {/* ===== Section 6: Launch Status ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
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
            <p className="mb-8">{t("launchStatus.intro")}</p>
          </FadeInUp>

          {/* Live Now */}
          <FadeInUp delay="0.15s">
            <h6 className="text-emerald-400 flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5" />
              Live Now
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {liveItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.2 + i * 0.03}s`}>
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 h-full">
                  <p className="text-pd5 font-medium">{item.title}</p>
                  <p className="mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Alpha Deployed */}
          <FadeInUp delay="0.35s">
            <h6 className="text-blue-400 flex items-center gap-2 mb-4">
              <Package className="w-5 h-5" />
              Alpha Deployed
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {deployedItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.4 + i * 0.03}s`}>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 h-full">
                  <p className="text-pd5 font-medium">{item.title}</p>
                  <p className="mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>

          {/* Coming Next */}
          <FadeInUp delay="0.5s">
            <h6 className="text-amber-400 flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5" />
              Coming Next
            </h6>
          </FadeInUp>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {comingItems.map((item, i) => (
              <FadeInUp key={i} delay={`${0.55 + i * 0.03}s`}>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 h-full">
                  <p className="text-pd5 font-medium">{item.title}</p>
                  <p className="mt-1">{item.description}</p>
                </div>
              </FadeInUp>
            ))}
          </div>
        </section>

        {/* ===== Section 7: Korea Market Entry ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("koreaMarket.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <p className="mb-8">{t("koreaMarket.intro")}</p>
          </FadeInUp>
          <div className="flex flex-col gap-4">
            {koreaItems.map((item, i) => {
              const Icon = koreaIcons[i];
              return (
                <FadeInUp key={i} delay={`${0.15 + i * 0.05}s`}>
                  <DividerBox color="pd2" padding="sm">
                    <div className="flex gap-3">
                      <Icon className="w-5 h-5 text-pado-2 shrink-0 mt-0.5" />
                      <div>
                        <h6 className="text-pd5 font-medium">{item.label}</h6>
                        <p className="mt-1">{item.description}</p>
                      </div>
                    </div>
                  </DividerBox>
                </FadeInUp>
              );
            })}
          </div>
        </section>

        {/* ===== Section 8: The Opportunity ===== */}
        <section>
          <FadeInUp>
            <SectionTitle as="h4" color="pd" className={sectionTitleClass}>
              {t("cta.title")}
            </SectionTitle>
          </FadeInUp>
          <FadeInUp delay="0.1s">
            <OuterBox color="pd0" padding="md">
              <p>{t("cta.body")}</p>
              <h5 className="text-pd5 font-medium mt-6">{t("cta.tagline")}</h5>
              <p className="text-pado-2 mt-2">{t("cta.closing")}</p>
              <p className="mt-1">{t("cta.motto")}</p>

              <h5 className="!font-rubik uppercase font-medium text-xl md:text-2xl mt-10 mb-2 text-center">
                {t("downloadCta.title")}
              </h5>
              <p className="text-pd3 text-center">{t("downloadCta.description")}</p>
              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                <Button variant="outlinePado" size="lg" asChild>
                  <a
                    href="/downloads/PADO-pitchdeck.pdf"
                    download="PADO-pitchdeck.pdf"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {t("downloadCta.pitchdeck")}
                    <Download className="w-4 h-4 ml-2" />
                  </a>
                </Button>
                <Button variant="outlinePado" size="lg" asChild>
                  <a
                    href="/downloads/Nasun-Litepaper-2026.pdf"
                    download="Nasun-Litepaper-2026.pdf"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {t("downloadCta.litepaper")}
                    <Download className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              </div>
            </OuterBox>
          </FadeInUp>
        </section>

      </div>
    </SectionLayout>
  );
};

export default FinanceContent;
