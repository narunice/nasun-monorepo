import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui";
import { PageTitle } from "@/components/ui/PageTitle";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrophy,
  faGem,
  faBolt,
  faCircleDot,
  faBullseye,
  faLightbulb,
  faTriangleExclamation,
  faScaleBalanced,
} from "@fortawesome/free-solid-svg-icons";
import { ButtonV3 } from "@/components/ui/button-v3";

const TIERS = ["platinum", "gold", "silver", "bronze"] as const;

const TIER_CONFIG: Record<
  (typeof TIERS)[number],
  {
    icon: typeof faTrophy | null;
    accentClass: string;
    iconColorClass: string;
    bgClass: string;
  }
> = {
  platinum: {
    icon: faTrophy,
    accentClass: "text-nasun-white",
    iconColorClass: "text-amber-300",
    bgClass: "bg-nasun-white/[0.08]",
  },
  gold: {
    icon: faGem,
    accentClass: "text-nasun-c1",
    iconColorClass: "text-nasun-c1",
    bgClass: "bg-nasun-c1/[0.08]",
  },
  silver: {
    icon: faBolt,
    accentClass: "text-nasun-nw4",
    iconColorClass: "text-nasun-nw4",
    bgClass: "bg-nasun-nw4/[0.08]",
  },
  bronze: {
    icon: null,
    accentClass: "text-nasun-white/50",
    iconColorClass: "",
    bgClass: "bg-nasun-white/[0.05]",
  },
};

const LeaderboardInfoSection: React.FC = () => {
  const { t } = useTranslation("leaderboard");

  const howItWorksItems = t("info.howItWorks.items", {
    returnObjects: true,
  }) as string[];

  const evaluationItems = t("info.evaluation.items", {
    returnObjects: true,
  }) as string[];

  const rewardNotes = t("info.rewards.notes", {
    returnObjects: true,
  }) as string[];

  const complianceParagraphs = t("info.compliance.paragraphs", {
    returnObjects: true,
  }) as string[];

  return (
    <SectionLayout className="!max-w-5xl">
      <div className="flex flex-col gap-10 md:gap-14 lg:gap-16">
        {/* --- Hero Header --- */}
        <header className="flex flex-col items-center text-center gap-4">
          <PageTitle as="h2" align="center">
            {t("info.pageTitle")}
          </PageTitle>

          <p className="max-w-2xl text-lg font-medium">{t("info.subtitle")}</p>

          <p className="max-w-2xl whitespace-pre-line text-nasun-white/70">
            {t("info.description")}
          </p>
        </header>

        {/* --- How It Works --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faLightbulb} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">{t("info.howItWorks.title")}</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          <p className="mb-4">{t("info.howItWorks.description")}</p>

          <ul className="space-y-2.5 mb-5">
            {howItWorksItems.map((item, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-2 w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <p className="text-nasun-white ">{t("info.howItWorks.note")}</p>
        </section>

        {/* --- Ranks & Recognition Table --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faBullseye} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">{t("info.rewards.title")}</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          <p className="mb-5">{t("info.rewards.description")}</p>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto bg-nasun-nw3/10 border border-nasun-nw4/30 rounded-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-nasun-nw3/20 border-b border-nasun-nw4/30">
                  <th className="px-4 py-3 text-left uppercase tracking-wider text-nasun-nw4 font-medium w-40">
                    {t("info.rewards.columns.tier")}
                  </th>
                  <th className="px-4 py-3 text-left uppercase tracking-wider text-nasun-nw4 font-medium">
                    {t("info.rewards.columns.recognition")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => {
                  const config = TIER_CONFIG[tier];
                  return (
                    <tr
                      key={tier}
                      className={`${config.bgClass} transition-colors hover:bg-nasun-white/[0.03]`}
                    >
                      <td className={`px-4 py-4 font-medium ${config.accentClass}`}>
                        <span className="flex items-center gap-2">
                          {config.icon && (
                            <FontAwesomeIcon
                              icon={config.icon}
                              className={`w-4 h-4 ${config.iconColorClass}`}
                            />
                          )}
                          {t(`info.rewards.${tier}.name`)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-nasun-white/80">
                        {t(`info.rewards.${tier}.recognition`)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="flex flex-col gap-3 md:hidden">
            {TIERS.map((tier) => {
              const config = TIER_CONFIG[tier];
              return (
                <div
                  key={tier}
                  className={`${config.bgClass} border border-nasun-white/[0.08] rounded-sm p-4`}
                >
                  <h6 className={`flex items-center gap-2 font-medium mb-2 ${config.accentClass}`}>
                    {config.icon && (
                      <FontAwesomeIcon
                        icon={config.icon}
                        className={`w-4 h-4 ${config.iconColorClass}`}
                      />
                    )}
                    {t(`info.rewards.${tier}.name`)}
                  </h6>
                  <p className="text-nasun-white/70">{t(`info.rewards.${tier}.recognition`)}</p>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div className="mt-5 space-y-2">
            {rewardNotes.map((note, i) => (
              <p key={i} className="text-sm text-nasun-white/50">
                {note}
              </p>
            ))}
          </div>
        </section>

        {/* --- How Contributions Are Evaluated + Transparency & Compliance --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {/* How Contributions Are Evaluated */}
          <OuterBox color="noborder" padding="sm" className="bg-nasun-c6">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faCircleDot} className="w-4 h-4 text-nasun-nw1" />
              <h6 className="font-medium uppercase tracking-wider">{t("info.evaluation.title")}</h6>
            </div>
            <p className="mb-4">{t("info.evaluation.description")}</p>
            <ul className="space-y-2.5 mb-5">
              {evaluationItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-nasun-white/70 font-medium mb-2">
              {t("info.evaluation.qualityNote")}
            </p>
            <p className="flex items-start gap-2 text-red-400/80">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 h-3.5 mt-1 shrink-0" />
              {t("info.evaluation.warning")}
            </p>
          </OuterBox>

          {/* Transparency & Compliance */}
          <OuterBox
            color="noborder"
            padding="sm"
            className="flex flex-col bg-nasun-c6"
          >
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faScaleBalanced} className="w-4 h-4 text-nasun-nw1" />
              <h6 className="font-medium uppercase tracking-wider">{t("info.compliance.title")}</h6>
            </div>
            <div className="space-y-4 flex-1 text-nasun-white/70 text-sm">
              {complianceParagraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </OuterBox>
        </div>

        {/* --- CTA Button --- */}
        <div className="flex justify-center">
          <ButtonV3 asChild variant="nw2" size="md">
            <Link to="/wave1/leaderboard">{t("info.viewLeaderboard")}</Link>
          </ButtonV3>
        </div>
      </div>
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
