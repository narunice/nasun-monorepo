import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { PageTitle } from "@/components/ui/PageTitle";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrophy,
  faGem,
  faBolt,
  faCheck,
  faMinus,
  faCircleDot,
  faShieldHalved,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import { buttonVariants } from "@/components/ui/button-variants";

const TARGET_ACCOUNT = import.meta.env.VITE_TARGET_TWEET_ACCOUNT || "Nasun_io";
const FOLLOW_INTENT_URL = `https://twitter.com/intent/follow?screen_name=${TARGET_ACCOUNT}`;

const TIERS = ["platinum", "gold", "silver", "bronze"] as const;

const TIER_CONFIG: Record<
  (typeof TIERS)[number],
  {
    icon: typeof faTrophy | null;
    accentClass: string;
    iconColorClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  platinum: {
    icon: faTrophy,
    accentClass: "text-nasun-white",
    iconColorClass: "text-amber-300",
    bgClass: "bg-nasun-white/[0.04]",
    borderClass: "border-l-nasun-white/60",
  },
  gold: {
    icon: faGem,
    accentClass: "text-nasun-c1",
    iconColorClass: "text-nasun-c1",
    bgClass: "bg-nasun-c1/[0.04]",
    borderClass: "border-l-nasun-c1/60",
  },
  silver: {
    icon: faBolt,
    accentClass: "text-nasun-nw4",
    iconColorClass: "text-nasun-nw4",
    bgClass: "bg-nasun-nw4/[0.04]",
    borderClass: "border-l-nasun-nw4/60",
  },
  bronze: {
    icon: null,
    accentClass: "text-nasun-white/50",
    iconColorClass: "",
    bgClass: "bg-nasun-white/[0.02]",
    borderClass: "border-l-nasun-white/20",
  },
};

const COLUMNS = ["rank", "tier", "poolShare", "battalionNft", "allowlist", "drawings"] as const;

const CheckMark: React.FC = () => (
  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-emerald-500/20">
    <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-emerald-400" />
  </span>
);

const DashMark: React.FC = () => (
  <span className="inline-flex items-center justify-center w-5 h-5 text-nasun-white/20">
    <FontAwesomeIcon icon={faMinus} className="w-3 h-3" />
  </span>
);

const LeaderboardInfoSection: React.FC = () => {
  const { t } = useTranslation("leaderboard");

  const earnPointsItems = t("info.earnPoints.items", {
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

          <p className="max-w-2xl">{t("info.subtitle")}</p>

          <p className="text-nasun-nw4">
            {t("info.howToJoin")}{" "}
            <a
              href={FOLLOW_INTENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-nasun-nw1 underline underline-offset-4 decoration-nasun-nw1/40 hover:decoration-nasun-nw1 transition-colors"
            >
              @{TARGET_ACCOUNT}
            </a>{" "}
            {t("info.howToJoinMiddle")} {t("info.howToJoinSuffix")}
          </p>
        </header>

        {/* --- Rewards Table --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faBullseye} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">{t("info.rewards.title")}</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-nasun-nw3/30">
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left uppercase tracking-wider text-nasun-nw4 font-medium text-sm"
                    >
                      {t(`info.rewards.columns.${col}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TIERS.map((tier) => {
                  const config = TIER_CONFIG[tier];
                  const allowlistVal = t(`info.rewards.${tier}.allowlist`);
                  const drawingsVal = t(`info.rewards.${tier}.drawings`);

                  return (
                    <tr
                      key={tier}
                      className={`${config.bgClass} border-l-2 ${config.borderClass} transition-colors hover:bg-nasun-white/[0.03]`}
                    >
                      <td className="px-4 py-4 text-nasun-white/90 font-mono">
                        {t(`info.rewards.${tier}.rank`)}
                      </td>
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
                      <td className="px-4 py-4 text-nasun-white/70">
                        {t(`info.rewards.${tier}.poolShare`)}
                      </td>
                      <td className="px-4 py-4 text-nasun-white/80">
                        {t(`info.rewards.${tier}.nft`)}
                      </td>
                      <td className="px-4 py-4">
                        {allowlistVal !== "-" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CheckMark />
                            <span className="text-emerald-400/80 font-medium">{allowlistVal}</span>
                          </span>
                        ) : (
                          <DashMark />
                        )}
                      </td>
                      <td className="px-4 py-4">
                        {drawingsVal === "true" ? <CheckMark /> : <DashMark />}
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
              const allowlistVal = t(`info.rewards.${tier}.allowlist`);
              const drawingsVal = t(`info.rewards.${tier}.drawings`);

              return (
                <div
                  key={tier}
                  className={`${config.bgClass} border border-nasun-white/[0.08] border-l-2 ${config.borderClass} rounded-sm p-4`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h6 className={`flex items-center gap-2 font-medium ${config.accentClass}`}>
                      {config.icon && (
                        <FontAwesomeIcon
                          icon={config.icon}
                          className={`w-4 h-4 ${config.iconColorClass}`}
                        />
                      )}
                      {t(`info.rewards.${tier}.name`)}
                    </h6>
                    <span className="text-nasun-white/50 font-mono">
                      {t(`info.rewards.columns.rank`)} {t(`info.rewards.${tier}.rank`)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-xs">
                        {t("info.rewards.columns.poolShare")}
                      </span>
                      <p className="mt-0.5">{t(`info.rewards.${tier}.poolShare`)}</p>
                    </div>
                    <div>
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-xs">
                        {t("info.rewards.columns.battalionNft")}
                      </span>
                      <p className="mt-0.5">{t(`info.rewards.${tier}.nft`)}</p>
                    </div>
                    <div>
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-xs">
                        {t("info.rewards.columns.allowlist")}
                      </span>
                      <div className="mt-1">
                        {allowlistVal !== "-" ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckMark />
                            <span className="text-emerald-400/80">{allowlistVal}</span>
                          </span>
                        ) : (
                          <DashMark />
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-xs">
                        {t("info.rewards.columns.drawings")}
                      </span>
                      <div className="mt-1">
                        {drawingsVal === "true" ? <CheckMark /> : <DashMark />}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* --- Bottom Grid: Earn Points + Fair Play --- */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-5">
          {/* Earn Points */}
          <div className="md:col-span-3 bg-nasun-nw2/10 border border-nasun-nw4/20 rounded-sm p-5 md:p-6">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faCircleDot} className="w-4 h-4 text-nasun-nw1" />
              <h6 className="font-medium uppercase tracking-wider">{t("info.earnPoints.title")}</h6>
            </div>
            <p className="mb-4">{t("info.earnPoints.description")}</p>
            <ul className="space-y-2.5">
              {earnPointsItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
                  <span className="text-nasun-white/85">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Fair Play */}
          <div className="md:col-span-2  bg-nasun-nw2/10 border border-nasun-nw4/20  rounded-sm p-5 md:p-6 flex flex-col">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faShieldHalved} className="text-nasun-nw1 w-4 h-4 " />
              <h6 className="font-medium uppercase tracking-wider">{t("info.fairPlay.title")}</h6>
            </div>
            <p className="flex-1 !text-nasun-scarlet/80">{t("info.fairPlay.description")}</p>
          </div>
        </div>

        {/* --- CTA Button --- */}
        <div className="flex justify-center">
          <Link to="/wave1/leaderboard" className={buttonVariants({ variant: "nw2", size: "xl" })}>
            {t("info.viewLeaderboard")}
          </Link>
        </div>
      </div>
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
