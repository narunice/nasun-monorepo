import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SectionLayout } from "@/components/layout/SectionLayout";
import { OuterBox } from "@/components/ui";
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
  faArrowRightToBracket,
} from "@fortawesome/free-solid-svg-icons";
import { buttonVariants } from "@/components/ui/button-variants";
import { SignUpModal } from "@/components/auth/SignUpModal";

const TELEGRAM_URL = "https://t.me/nasun_official";

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
  const { user, isAuthenticated } = useAuth();
  const [isSignUpModalOpen, setIsSignUpModalOpen] = useState(false);

  const hasTwitter = user?.provider === "Twitter" || !!user?.linkedAccounts?.twitter?.twitterHandle;

  const earnPointsItems = t("info.earnPoints.items", {
    returnObjects: true,
  }) as string[];

  const fairPlayItems = t("info.fairPlay.items", {
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
        </header>

        {/* --- How To Join --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faArrowRightToBracket} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">{t("info.howToJoin.title")}</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          <ul className="flex flex-col gap-3">
            {/* Bullet 1: X account sign up / link */}
            <li className="flex items-baseline gap-3">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
              <p className="">
                {isAuthenticated && hasTwitter ? (
                  // State 3: eligible
                  <span className="flex items-center gap-1.5 text-emerald-400/90">
                    <FontAwesomeIcon icon={faCheck} className="w-3 h-3 shrink-0" />
                    {t("info.howToJoin.eligible")}
                  </span>
                ) : isAuthenticated && !hasTwitter ? (
                  // State 2: logged in but no X
                  <>
                    {t("info.howToJoin.linkAccount.pre")}
                    <Link
                      to="/my-account"
                      className="text-nasun-nw1 underline underline-offset-4 decoration-nasun-nw1/30 hover:decoration-nasun-nw1 transition-colors"
                    >
                      {t("info.howToJoin.linkAccount.link")}
                    </Link>
                    {t("info.howToJoin.linkAccount.post")}{" "}
                    <span className="text-nasun-white/40">
                      {t("info.howToJoin.linkAccount.label")}
                    </span>
                  </>
                ) : (
                  // State 1: not authenticated
                  <>
                    {t("info.howToJoin.signUp.pre")}
                    <button
                      onClick={() => setIsSignUpModalOpen(true)}
                      className="text-nasun-white underline underline-offset-4 decoration-nasun-white/30 hover:decoration-nasun-white transition-colors cursor-pointer"
                    >
                      {t("info.howToJoin.signUp.link")}
                    </button>
                    {t("info.howToJoin.signUp.post")}{" "}
                    <span className="text-nasun-white/60">{t("info.howToJoin.signUp.label")}</span>
                  </>
                )}
              </p>
            </li>

            {/* Bullet 2: Telegram */}
            <li className="flex items-baseline gap-3">
              <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
              <p className="">
                {t("info.howToJoin.telegram.pre")}
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-nasun-white underline underline-offset-4 decoration-nasun-white/30 hover:decoration-nasun-white transition-colors"
                >
                  {t("info.howToJoin.telegram.link")}
                </a>
                {t("info.howToJoin.telegram.post")}{" "}
                <span className="text-nasun-white/60">{t("info.howToJoin.telegram.label")}</span>
              </p>
            </li>
          </ul>
        </section>

        {/* --- Rewards Table --- */}
        <section>
          <div className="flex items-center gap-3 mb-5 md:mb-6">
            <FontAwesomeIcon icon={faBullseye} className="w-4 h-4 text-nasun-nw1" />
            <h5 className="font-medium uppercase tracking-wider">{t("info.rewards.title")}</h5>
            <div className="flex-1 h-px bg-gradient-to-r from-nasun-nw1/30 to-transparent" />
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto bg-nasun-nw3/10 border border-nasun-nw4/30 rounded-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-nasun-nw3/20 border-b border-nasun-nw4/30">
                  {COLUMNS.map((col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left uppercase tracking-wider text-nasun-nw4 font-medium"
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
                      className={`${config.bgClass} transition-colors hover:bg-nasun-white/[0.03]`}
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
                  className={`${config.bgClass} border border-nasun-white/[0.08] rounded-sm p-4`}
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
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-sm">
                        {t("info.rewards.columns.poolShare")}
                      </span>
                      <p className="mt-0.5">{t(`info.rewards.${tier}.poolShare`)}</p>
                    </div>
                    <div>
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-sm">
                        {t("info.rewards.columns.battalionNft")}
                      </span>
                      <p className="mt-0.5">{t(`info.rewards.${tier}.nft`)}</p>
                    </div>
                    <div>
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-sm">
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
                      <span className="text-nasun-nw1/60 uppercase tracking-wider text-sm">
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
          <OuterBox color="nw0" padding="sm" className="md:col-span-3">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faCircleDot} className="w-4 h-4 text-nasun-nw1" />
              <h6 className="font-medium uppercase tracking-wider">{t("info.earnPoints.title")}</h6>
            </div>
            <p className="mb-4">{t("info.earnPoints.description")}</p>
            <ul className="space-y-2.5">
              {earnPointsItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-nasun-nw1 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </OuterBox>

          {/* Fair Play */}
          <OuterBox color="nw0" padding="sm" className="md:col-span-2 flex flex-col">
            <div className="flex items-center gap-2.5 mb-4">
              <FontAwesomeIcon icon={faShieldHalved} className="text-red-500 w-4 h-4" />
              <h6 className="font-medium uppercase tracking-wider">{t("info.fairPlay.title")}</h6>
            </div>
            <ul className="space-y-2.5 flex-1">
              {fairPlayItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </OuterBox>
        </div>

        {/* --- CTA Button --- */}
        <div className="flex justify-center">
          <Link to="/wave1/leaderboard" className={buttonVariants({ variant: "nw2", size: "xl" })}>
            {t("info.viewLeaderboard")}
          </Link>
        </div>
      </div>

      <SignUpModal
        isOpen={isSignUpModalOpen}
        onClose={() => setIsSignUpModalOpen(false)}
        twitterOnly
      />
    </SectionLayout>
  );
};

export default LeaderboardInfoSection;
